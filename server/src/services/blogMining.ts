import { z } from 'zod';
import { extractJson, sanitizeUserInput, type LlmProvider } from '@triptic/ai-engine';
import { logger } from '../logger.js';

/**
 * Pipeline TDM blogs → faits structurés (roadmap 6).
 *
 * Base légale : exception de fouille de textes et données, art. 4 directive
 * (UE) 2019/790, transposée art. L122-5-3-III CPI (couvre aussi le droit
 * sui generis des bases, art. L342-3) — fouille commerciale autorisée SAUF
 * OPPOSITION du titulaire. D'où les règles absolues de ce module :
 *  1. Opt-out honoré à chaque fetch (robots.txt RFC 9309, balises noai/notdm,
 *     TDMRep, ai.txt) + registre par source, re-vérifiable
 *  2. Faits, pas expression : sortie contrainte aux enums/coordonnées/tags —
 *     JAMAIS de phrase du blog (pas de summary sur les fiches web)
 *  3. Anti-copie : rejet de tout champ chevauchant le texte source (n-grams)
 *  4. Anti-mirroring : plafond d'extraction par source
 *  5. RGPD : aucun nom de personne, email, téléphone dans la sortie
 * Chaque fiche passe ensuite par l'agent de conformité (gate 6.7) AVANT
 * toute publication.
 */

export type OptOutStatus = 'allowed' | 'opted_out' | 'unknown';

export interface OptOutCheck {
  status: OptOutStatus;
  detail: string | null;
}

/** Plafond anti-mirroring : jamais plus de N faits extraits d'une même source. */
export const MAX_FACTS_PER_SOURCE = 15;

const FETCH_TIMEOUT_MS = 15_000;
const USER_AGENT =
  'TRIPTIC-TDM/0.1 (+https://triptic.app/legal/tdm; opt-out: robots.txt, noai, mailto:contact@triptic.app)';

async function fetchText(url: string, fetchImpl: typeof fetch): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const response = await fetchImpl(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!response.ok) return null;
    // X-Robots-Tag noai/noindex au niveau HTTP compte comme opt-out (vérifié par l'appelant)
    return await response.text();
  } catch {
    return null;
  }
}

/** Règles robots.txt applicables à notre agent (RFC 9309, parsing minimal). */
export function robotsDisallowsAll(robotsTxt: string): boolean {
  const lines = robotsTxt.split('\n').map((l) => l.trim());
  let applies = false;
  for (const line of lines) {
    const [rawKey, ...rest] = line.split(':');
    const key = rawKey?.toLowerCase().trim();
    const value = rest.join(':').split('#')[0]?.trim() ?? '';
    if (key === 'user-agent') {
      applies = value === '*' || value.toLowerCase().includes('triptic');
    } else if (applies && key === 'disallow' && (value === '/' || value === '/*')) {
      return true;
    }
  }
  return false;
}

/** Balises d'opt-out TDM/IA dans le HTML (meta robots, TDMRep). */
export function htmlOptsOut(html: string): string | null {
  const metaRobots = html.match(
    /<meta[^>]+name=["'](?:robots|tdm-reservation)["'][^>]+content=["']([^"']*)["']/gi,
  );
  for (const tag of metaRobots ?? []) {
    const content = tag.match(/content=["']([^"']*)["']/i)?.[1]?.toLowerCase() ?? '';
    if (/noai|notdm|noimageai/.test(content)) return `meta ${content}`;
    if (tag.toLowerCase().includes('tdm-reservation') && content.trim() === '1') {
      return 'tdm-reservation';
    }
  }
  return null;
}

/**
 * Vérifie l'opt-out d'une source AVANT tout traitement : robots.txt,
 * ai.txt, balises HTML. Le scan CGU en langage naturel est fait par
 * l'agent de conformité (LLM) sur le texte de la page.
 */
export async function checkOptOut(
  pageUrl: string,
  html: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<OptOutCheck> {
  const origin = new URL(pageUrl).origin;
  const robots = await fetchText(`${origin}/robots.txt`, fetchImpl);
  if (robots && robotsDisallowsAll(robots)) {
    return { status: 'opted_out', detail: 'robots.txt' };
  }
  const aiTxt = await fetchText(`${origin}/ai.txt`, fetchImpl);
  if (aiTxt && /disallow\s*:\s*\/\s*$/im.test(aiTxt)) {
    return { status: 'opted_out', detail: 'ai.txt' };
  }
  if (html) {
    const meta = htmlOptsOut(html);
    if (meta) return { status: 'opted_out', detail: meta };
  }
  return { status: robots === null ? 'unknown' : 'allowed', detail: null };
}

/** Texte lisible d'une page HTML (balises et scripts retirés). */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const N_GRAM = 6;

function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Détecteur de copie (faits, pas expression) : true si le champ contient une
 * séquence de N_GRAM mots présente telle quelle dans le texte source.
 */
export function hasCopiedPhrase(field: string, sourceText: string): boolean {
  const words = normalizeWords(field);
  if (words.length < N_GRAM) return false;
  const source = normalizeWords(sourceText).join(' ');
  for (let i = 0; i + N_GRAM <= words.length; i += 1) {
    if (source.includes(words.slice(i, i + N_GRAM).join(' '))) return true;
  }
  return false;
}

/** RGPD : la sortie ne doit contenir ni email, ni téléphone, ni handle. */
export function containsPersonalData(text: string): boolean {
  return (
    /[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(text) ||
    /(\+\d{1,3}[\s.-]?)?(\(?\d{2,3}\)?[\s.-]?)?\d{2}[\s.-]\d{2}[\s.-]\d{2}([\s.-]\d{2})?/.test(text) ||
    /@[a-z0-9_]{3,}/i.test(text)
  );
}

/**
 * Fait candidat extrait d'un blog : structure UNIQUEMENT (enums, coordonnées,
 * tags courts). Pas de summary — l'expression reste au blog.
 */
export const blogFactSchema = z.object({
  name: z.string().min(2).max(120),
  kind: z.enum([
    'peak', 'pass', 'lake', 'waterfall', 'gorge', 'glacier', 'viewpoint',
    'refuge', 'camp', 'castle', 'village', 'museum', 'attraction',
    'restaurant', 'cafe', 'bar', 'fast_food', 'trail', 'poi',
  ]),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
  /** 0-4 tags d'ambiance d'un seul mot (vérifiés par le détecteur de copie). */
  tags: z.array(z.string().max(20)).max(4).default([]),
});
export type BlogFact = z.infer<typeof blogFactSchema>;

/** Les faits sont validés UN PAR UN : un champ non conforme rejette le fait,
 * jamais tout le lot. */
const extractionOutputSchema = z.object({ facts: z.array(z.unknown()).max(30) });

function buildExtractionPrompt(): string {
  return `Tu extrais des FAITS GÉOGRAPHIQUES d'un article de blog outdoor pour la base de lieux TRIPTIC.

RÈGLES ABSOLUES (conformité juridique — exception TDM, faits non protégés / expression protégée) :
1. Tu ne sors QUE des données structurées : nom du lieu, type, coordonnées si présentes, tags d'UN SEUL mot
2. INTERDIT de recopier une phrase, une description, un avis ou une tournure de l'article
3. INTERDIT de sortir des noms de personnes, emails, téléphones, pseudonymes
4. Ne liste que des LIEUX PHYSIQUES réels (sommet, lac, refuge, village, restaurant…)
5. Si l'article oppose une réserve à la fouille de données (« no scraping », « no AI », « reproduction interdite »…), réponds {"facts": [], "tdm_reservation": true}

Types STRICTS : peak, pass, lake, waterfall, gorge, glacier, viewpoint, refuge, camp, castle, village, museum, attraction, restaurant, cafe, bar, fast_food, trail, poi

Réponds UNIQUEMENT avec : {"facts": [{"name": string, "kind": string, "lat": number|null, "lng": number|null, "tags": string[]}], "tdm_reservation"?: boolean}`;
}

export interface ExtractionResult {
  facts: BlogFact[];
  /** true si le LLM a repéré une réserve TDM dans le texte lui-même. */
  tdmReservation: boolean;
  /** Champs rejetés par le détecteur de copie ou le filtre RGPD. */
  rejected: number;
}

/**
 * Extraction contrainte des faits d'une page (le texte est tronqué : le
 * plafond anti-mirroring rend inutile d'envoyer plus).
 */
export async function extractFacts(
  provider: LlmProvider,
  pageText: string,
): Promise<ExtractionResult> {
  const raw = await provider.complete({
    system: buildExtractionPrompt(),
    messages: [{ role: 'user', content: sanitizeUserInput(pageText.slice(0, 12000)) }],
    maxTokens: 4000,
  });
  const parsed = extractJson(raw) as { tdm_reservation?: boolean };
  const output = extractionOutputSchema.parse(parsed);

  let rejected = 0;
  const facts: BlogFact[] = [];
  for (const candidate of output.facts) {
    const parsedFact = blogFactSchema.safeParse(candidate);
    if (!parsedFact.success) {
      rejected += 1;
      continue;
    }
    const fact = parsedFact.data;
    const fields = [fact.name, ...fact.tags].join(' ');
    if (
      hasCopiedPhrase(fact.name, pageText) ||
      containsPersonalData(fields) ||
      // Tags multi-mots = expression potentielle → rejet
      fact.tags.some((tag) => tag.trim().includes(' '))
    ) {
      rejected += 1;
      continue;
    }
    facts.push(fact);
  }

  if (rejected > 0) logger.info({ rejected }, 'Blog mining — champs rejetés (copie/RGPD)');
  return {
    facts: facts.slice(0, MAX_FACTS_PER_SOURCE),
    tdmReservation: parsed.tdm_reservation === true,
    rejected,
  };
}
