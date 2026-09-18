import {
  createAnthropicImageJudge,
  extractJson,
  type ImageJudge,
  type JudgedImage,
} from '@triptic/ai-engine';
import { z } from 'zod';
import { logger } from '../logger.js';
import { PHOTO_RULES_VERSION } from './photoAgent.js';

/**
 * AGENT 6, second regard — la photo elle-même, pas ce qu'on en dit.
 *
 * L'agent photo juge sur les faits Commons (titre, catégories…). Mais un
 * titre peut mentir : « Viewpoint, Waterfall » (Bonlieu, Jura) montrait des
 * pieds sur une passerelle grillagée. Ici un modèle qui voit les images
 * valide chaque photo avant qu'elle ne soit servie, en petit format (330 px).
 *
 * Indisponible (pas de clé, panne, délai dépassé) : on s'en remet à l'agent
 * texte — jamais de trip sans photo à cause de ce contrôle.
 */

export const VISION_PROMPT = `Tu vérifies des photos pour VIRE (règles photo ${PHOTO_RULES_VERSION}), une app de voyages en van, à pied et à vélo.
Chaque photo illustre un lieu du voyage. Elle doit montrer L'ESPACE que le voyageur va parcourir : une vue extérieure large, prise avec du recul, où le paysage domine — relief, vallée, lac, forêt, glacier, mer de nuages, village ou ville vus de loin.

REFUSE toute photo dont le sujet principal est :
- une personne ou une partie du corps (pieds, mains, selfie), une foule
- un véhicule, un train, un avion
- un bâtiment vu de près (hôtel, façade, église, maison), un intérieur, un objet, un panneau, un texte, une carte
- un animal ou une plante en gros plan
- une piste de ski équipée, des remontées mécaniques ou des skieurs au premier plan
et toute photo floue, très sombre ou mal cadrée.
En cas de doute, REFUSE : l'app a d'autres photos à proposer.`;

const ANSWER_FORMAT =
  'Réponds UNIQUEMENT avec un objet JSON listant les numéros des photos acceptées : {"keep": [0, 2]}';

let judge: ImageJudge | null = null;
/** Après une panne, le juge est laissé de côté un moment : pas 30 s d'attente par lot. */
let pausedUntil = 0;
const PAUSE_AFTER_FAILURE_MS = 2 * 60 * 1000;

/** Branché au démarrage du serveur (et des scripts) ; absent dans les tests. */
export function setPhotoJudge(next: ImageJudge | null): void {
  judge = next;
  pausedUntil = 0;
  verdicts.clear();
}

/** Le juge visuel depuis l'environnement, ou null sans clé Anthropic. */
export function photoJudgeFromEnv(env: NodeJS.ProcessEnv = process.env): ImageJudge | null {
  const key = env['ANTHROPIC_API_KEY'];
  if (!key || key.startsWith('sk-ant-xxx')) return null;
  return createAnthropicImageJudge(key);
}

/** Verdicts déjà rendus : une photo ne se regarde qu'une fois. */
const verdicts = new Map<string, boolean>();
const VERDICT_MAX_ENTRIES = 5000;
/** Photos par appel : une douzaine d'images de 330 px reste un petit message. */
const IMAGES_PER_CALL = 12;
const IMAGE_TIMEOUT_MS = 8000;
export const VISION_TIMEOUT_MS = 30_000;

const verdictSchema = z.object({ keep: z.array(z.coerce.number().int().nonnegative()) });

/** Une photo = son URL sans paramètres (suivi Wikimedia, taille Unsplash). */
function photoKey(url: string): string {
  return url.split('?')[0] ?? url;
}

/** La même photo en 330 px : assez pour juger, léger à envoyer. */
function smallVersion(url: string): string {
  try {
    const parsed = new URL(url);
    if (/wikimedia\.org$/.test(parsed.hostname)) {
      parsed.pathname = parsed.pathname.replace(/\/\d+px-([^/]+)$/, '/330px-$1');
      parsed.search = '';
    } else if (/unsplash\.com$|pexels\.com$/.test(parsed.hostname)) {
      parsed.searchParams.set('w', '330');
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

const MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

async function download(url: string): Promise<JudgedImage | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);
  try {
    const res = await fetch(smallVersion(url), {
      headers: { 'User-Agent': 'TRIPTIC/0.1 (https://viretrip.com)' },
      signal: controller.signal,
    });
    const mediaType = (res.headers.get('content-type') ?? '').split(';')[0]?.trim() ?? '';
    if (!res.ok || !MEDIA_TYPES.has(mediaType)) return null;
    const data = Buffer.from(await res.arrayBuffer()).toString('base64');
    return { data, mediaType: mediaType as JudgedImage['mediaType'] };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function remember(key: string, ok: boolean): void {
  if (verdicts.size >= VERDICT_MAX_ENTRIES) {
    const oldest = verdicts.keys().next().value;
    if (oldest !== undefined) verdicts.delete(oldest);
  }
  verdicts.set(key, ok);
}

/** Regarde un lot d'images en un appel ; les verdicts vont dans le cache. */
async function lookAtBatch(current: ImageJudge, urls: string[]): Promise<void> {
  const images = await Promise.all(urls.map(download));
  const shown = urls.flatMap((url, i) => {
    const image = images[i];
    return image ? [{ url, image }] : [];
  });
  if (shown.length === 0) return;
  let raw = '';
  try {
    raw = await current.look({
      system: VISION_PROMPT,
      prompt: ANSWER_FORMAT,
      images: shown.map(({ image }) => image),
      timeoutMs: VISION_TIMEOUT_MS,
    });
    const { keep } = verdictSchema.parse(extractJson(raw));
    shown.forEach(({ url }, n) => remember(photoKey(url), keep.includes(n)));
    logger.info(
      {
        audit: true,
        agent: 'photo-vision',
        rulesVersion: PHOTO_RULES_VERSION,
        model: current.name,
        shown: shown.length,
        kept: shown.filter(({ url }) => verdicts.get(photoKey(url))).length,
      },
      'Photo vision decision',
    );
  } catch (error) {
    logger.warn(
      { error, context: 'photo-vision', rawSnippet: raw.slice(0, 200) },
      'Photo vision unavailable',
    );
    pausedUntil = Date.now() + PAUSE_AFTER_FAILURE_MS;
  }
}

/**
 * Verdict visuel de chaque URL : true = vue d'ensemble, false = à écarter.
 * Une URL absente du résultat n'a pas pu être regardée (pas de juge, image
 * injoignable, panne) : l'appelant s'en remet alors à l'agent texte.
 */
export async function checkByEye(urls: string[]): Promise<Map<string, boolean>> {
  const current = judge;
  const result = new Map<string, boolean>();
  if (!current || Date.now() < pausedUntil) return result;
  const todo = [...new Set(urls)].filter((url) => !verdicts.has(photoKey(url)));
  const batches: string[][] = [];
  for (let i = 0; i < todo.length; i += IMAGES_PER_CALL) batches.push(todo.slice(i, i + IMAGES_PER_CALL));
  await Promise.all(batches.map((batch) => lookAtBatch(current, batch)));
  for (const url of urls) {
    const verdict = verdicts.get(photoKey(url));
    if (verdict !== undefined) result.set(url, verdict);
  }
  return result;
}
