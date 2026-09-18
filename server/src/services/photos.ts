import type { LlmProvider } from '@triptic/ai-engine';
import { PHOTO_RULES_VERSION, rankPlacePhotos } from '../agents/photoAgent.js';
import { logger } from '../logger.js';
import type { GalleryStore } from '../repo/galleries.js';

/** Un média de lieu avec son crédit (obligatoire : CGU / licences CC). */
export interface PlaceMedia {
  type: 'photo' | 'video';
  /** Photo : image affichable. Vidéo : fichier MP4 à lire. */
  url: string;
  /** Vignette / poster de la vidéo. */
  thumb: string;
  author: string;
  /** Page du média chez le fournisseur — lien de crédit exigé. */
  link: string;
  source: 'commons' | 'unsplash' | 'pexels';
  /** Licence à afficher (Commons : CC BY-SA 4.0…). */
  license?: string | undefined;
}

/**
 * Ce que Wikimedia Commons dit d'une photo : de quoi juger, sans la voir, si
 * elle montre l'espace (titre, description, catégories) et si son cadrage
 * remplit une carte (dimensions de l'original, 0 si inconnues).
 */
export interface PhotoFacts {
  title: string;
  description: string;
  categories: string[];
  width: number;
  height: number;
}

/** Photo Commons en lice, avec ses faits — jamais servie telle quelle au client. */
export interface PhotoCandidate extends PlaceMedia {
  facts: PhotoFacts;
}

/**
 * Cache mémoire des galeries : le quota Unsplash gratuit est de 50 req/h,
 * or une carte de trip interroge un lieu par marqueur ouvert. TTL 24 h,
 * suffisant (les photos d'un lieu ne bougent pas) et borné en taille.
 */
const galleryCache = new Map<string, { at: number; media: PlaceMedia[] }>();
const GALLERY_TTL_MS = 24 * 60 * 60 * 1000;
const GALLERY_MAX_ENTRIES = 500;
/** Nombre de vidéos ajoutées en fin de galerie, en plus des photos. */
const VIDEO_SLOTS = 3;

/**
 * Clés de galerie liées à la version des règles de l'agent photo : des règles
 * plus strictes périment d'un coup les galeries filtrées avec les anciennes,
 * qui seraient sinon relues depuis la base — voitures de police comprises.
 */
export const GALLERY_KEY_PREFIX = `photos-v${PHOTO_RULES_VERSION}|`;

function cacheGet(key: string): PlaceMedia[] | null {
  const hit = galleryCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > GALLERY_TTL_MS) {
    galleryCache.delete(key);
    return null;
  }
  return hit.media;
}

/**
 * Persistance optionnelle des galeries (migration 0009). Absente en dev sans
 * DATABASE_URL : on retombe alors sur le seul cache mémoire, comme avant.
 */
let galleryStore: GalleryStore | null = null;

export function setGalleryStore(store: GalleryStore | null): void {
  galleryStore = store;
}

function cacheSet(key: string, media: PlaceMedia[]): void {
  if (galleryCache.size >= GALLERY_MAX_ENTRIES) {
    const oldest = galleryCache.keys().next().value;
    if (oldest !== undefined) galleryCache.delete(oldest);
  }
  galleryCache.set(key, { at: Date.now(), media });
}

/** Écriture best-effort : une base absente ou en panne ne casse pas l'affichage. */
function persist(key: string, query: string, media: PlaceMedia[]): void {
  if (!galleryStore) return;
  void galleryStore.set(key, query, media).catch((error) => {
    logger.warn({ error, context: 'gallery-store' }, 'Gallery write failed');
  });
}

/** Wikimedia demande un User-Agent identifiant l'application. */
const COMMONS_UA = 'TRIPTIC/0.1 (https://triptic.app; contact@triptic.app)';

/** `<a href=...>Nom</a>` → `Nom` (extmetadata renvoie du HTML). */
function stripHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Un contributeur qui a téléversé 40 macros au même endroit monopolise sinon
 * la galerie (scarabées, fleurs…) : on répartit par auteur, en 2 passes, pour
 * qu'un aperçu de lieu montre plusieurs regards plutôt qu'un seul reportage.
 */
export function diversifyByAuthor<T extends PlaceMedia>(media: T[], limit: number): T[] {
  const byAuthor = new Map<string, T[]>();
  for (const item of media) {
    const list = byAuthor.get(item.author);
    if (list) list.push(item);
    else byAuthor.set(item.author, [item]);
  }
  const picked: T[] = [];
  for (let round = 0; picked.length < limit && round < media.length; round++) {
    let addedThisRound = false;
    for (const list of byAuthor.values()) {
      const item = list[round];
      if (!item) continue;
      picked.push(item);
      addedThisRound = true;
      if (picked.length >= limit) break;
    }
    if (!addedThisRound) break;
  }
  return picked;
}

/**
 * Wikimedia ajoute des paramètres de suivi (utm_*) à ses vignettes : sans
 * effet sur l'image, ils rendent l'URL instable pour les caches.
 */
export function withoutTracking(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.search = '';
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Requêtes Commons simultanées, toutes origines confondues (couvertures,
 * photos du jour, carrousel) : Wikimedia demande de ménager son API.
 */
const COMMONS_CONCURRENCY = 3;
let commonsActive = 0;
const commonsWaiting: (() => void)[] = [];

async function withCommonsSlot<T>(task: () => Promise<T>): Promise<T> {
  if (commonsActive < COMMONS_CONCURRENCY) commonsActive += 1;
  // Le créneau libéré est transmis tel quel : jamais plus de trois à la fois
  else await new Promise<void>((resolve) => commonsWaiting.push(resolve));
  try {
    return await task();
  } finally {
    const next = commonsWaiting.shift();
    if (next) next();
    else commonsActive -= 1;
  }
}

const COMMONS_API = 'https://commons.wikimedia.org/w/api.php?action=query';
/** Faits utiles au jugement (catégories, description, taille) et vignette 960 px. */
const COMMONS_PROPS =
  '&prop=imageinfo&iiprop=url%7Csize%7Cextmetadata' +
  '&iiextmetadatafilter=Artist%7CLicenseShortName%7CCategories%7CImageDescription' +
  '&iiurlwidth=900&format=json&origin=*';

/**
 * Mots des photos de paysage, dans les langues des régions couvertes. Autour
 * du point, la recherche plein texte remonte les panoramas ; les photos les
 * plus proches sont seulement ce qu'on a photographié là — au centre de
 * Bolzano, 24 voitures de police d'un même reportage.
 */
const VIEW_SEARCH_TERMS =
  'panorama OR landscape OR view OR vue OR paysage OR Aussicht OR Blick OR Landschaft OR veduta OR paesaggio';

interface CommonsPage {
  title?: string;
  /** Rang dans le générateur : pertinence (recherche) ou distance (géo). */
  index?: number;
  imageinfo?: {
    thumburl?: string;
    url?: string;
    descriptionurl?: string;
    width?: number;
    height?: number;
    extmetadata?: Record<string, { value?: string }>;
  }[];
}

/** « File:Col_Petit_Ballon 2024.jpg » → « Col Petit Ballon 2024 ». */
function fileTitle(pageTitle: string): string {
  return pageTitle
    .replace(/^File:/, '')
    .replace(/\.(jpe?g|png)$/i, '')
    .replace(/_+/g, ' ')
    .trim();
}

/** Une requête Commons pendue garderait pour toujours l'un des trois créneaux. */
const COMMONS_TIMEOUT_MS = 8000;

async function queryCommons(url: string): Promise<PhotoCandidate[]> {
  try {
    const data = await withCommonsSlot(async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), COMMONS_TIMEOUT_MS);
      try {
        const res = await fetch(url, { headers: { 'User-Agent': COMMONS_UA }, signal: controller.signal });
        if (!res.ok) return null;
        return (await res.json()) as { query?: { pages?: Record<string, CommonsPage> } };
      } finally {
        clearTimeout(timer);
      }
    });
    if (!data) return [];
    const pages = Object.values(data.query?.pages ?? {}).sort(
      (a, b) => (a.index ?? 0) - (b.index ?? 0),
    );
    const found: PhotoCandidate[] = [];
    for (const page of pages) {
      const info = page.imageinfo?.[0];
      const raw = info?.thumburl ?? info?.url;
      if (!raw) continue;
      // Les fichiers non photographiques (cartes, blasons) desservent l'aperçu
      if (!/\.(jpe?g|png)$/i.test(page.title ?? '')) continue;
      const display = withoutTracking(raw);
      const meta = info?.extmetadata ?? {};
      found.push({
        type: 'photo',
        url: display,
        thumb: display,
        author: stripHtml(meta['Artist']?.value ?? '') || 'Wikimedia Commons',
        link: info?.descriptionurl ?? 'https://commons.wikimedia.org',
        source: 'commons',
        license: stripHtml(meta['LicenseShortName']?.value ?? '') || undefined,
        facts: {
          title: fileTitle(page.title ?? ''),
          description: stripHtml(meta['ImageDescription']?.value ?? '').slice(0, 300),
          categories: (meta['Categories']?.value ?? '')
            .split('|')
            .map((c) => c.trim())
            .filter(Boolean),
          width: info?.width ?? 0,
          height: info?.height ?? 0,
        },
      });
    }
    return found;
  } catch (error) {
    logger.warn({ error, context: 'gallery-commons' }, 'Commons query failed');
    return [];
  }
}

/**
 * Photos Wikimedia Commons autour d'un point — source PRINCIPALE. Les
 * recherches par mot-clé (Unsplash/Pexels) confondent le nom du lieu avec son
 * sens commun : « Petit Ballon » renvoyait des ballons de baudruche. Ici c'est
 * la position qui sélectionne. Vues d'ensemble d'abord (recherche des mots de
 * paysage dans 5 km), complétées par les photos les plus proches quand elles
 * ne suffisent pas. Sans jugement : rankPlacePhotos trie ensuite.
 */
export async function findCommonsMedia(
  lat: number,
  lng: number,
  wanted: number,
): Promise<PhotoCandidate[]> {
  const batch = Math.min(wanted * 2, 50);
  const search = `nearcoord:5km,${lat},${lng} filew:>999 ${VIEW_SEARCH_TERMS}`;
  const views = await queryCommons(
    `${COMMONS_API}&generator=search&gsrnamespace=6&gsrlimit=${batch}` +
      `&gsrsearch=${encodeURIComponent(search)}${COMMONS_PROPS}`,
  );
  if (views.length >= wanted) return views;
  const nearest = await queryCommons(
    `${COMMONS_API}&generator=geosearch&ggscoord=${lat}%7C${lng}&ggsradius=4000` +
      `&ggslimit=${batch}&ggsnamespace=6${COMMONS_PROPS}`,
  );
  const seen = new Set(views.map((photo) => photo.url));
  return [...views, ...nearest.filter((photo) => !seen.has(photo.url))];
}

/** Retire les faits Commons : le client n'a besoin que de l'image et du crédit. */
function toPlaceMedia({ type, url, thumb, author, link, source, license }: PhotoCandidate): PlaceMedia {
  return { type, url, thumb, author, link, source, license };
}

/**
 * Vidéos Pexels du lieu (Unsplash n'en propose pas). On retient un MP4 de
 * qualité SD : suffisant dans un carrousel de 288 px et économe en données
 * mobiles, contexte outdoor où le réseau est souvent limité.
 */
async function findPexelsVideos(query: string, limit: number): Promise<PlaceMedia[]> {
  const pexelsKey = process.env['PEXELS_API_KEY'];
  if (!pexelsKey || pexelsKey.startsWith('xxx') || limit < 1) return [];
  const videos: PlaceMedia[] = [];
  try {
    const res = await fetch(
      `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=${limit}&orientation=portrait`,
      { headers: { Authorization: pexelsKey } },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      videos?: {
        url?: string;
        image?: string;
        user?: { name?: string };
        video_files?: { link?: string; quality?: string; file_type?: string }[];
      }[];
    };
    for (const item of data.videos ?? []) {
      const files = item.video_files ?? [];
      const mp4 = files.filter((f) => f.file_type === 'video/mp4' && f.link);
      const file = mp4.find((f) => f.quality === 'sd') ?? mp4[0];
      if (!file?.link || !item.image) continue;
      videos.push({
        type: 'video',
        url: file.link,
        thumb: item.image,
        author: item.user?.name ?? 'Pexels',
        link: item.url ?? 'https://pexels.com',
        source: 'pexels',
      });
    }
  } catch (error) {
    logger.warn({ error, context: 'gallery-pexels-video' }, 'Pexels video gallery failed');
  }
  return videos;
}

/** Vidé par les tests — jamais appelé en production. */
export function clearGalleryCache(): void {
  galleryCache.clear();
  viewCache.clear();
}

/**
 * Galerie d'un lieu (carrousel carte) : avec des coordonnées, les vues
 * d'ensemble Commons validées par l'agent photo ; sinon Unsplash complété par
 * Pexels jusqu'à `limit`. Retourne [] si aucune clé configurée ou en cas
 * d'échec — l'UI retombe alors sur le marqueur simple, sans carrousel.
 */
export async function findPlacePhotos(
  query: string,
  limit = 10,
  coords?: { lat: number; lng: number } | undefined,
  provider: LlmProvider | null = null,
): Promise<PlaceMedia[]> {
  const key = `${GALLERY_KEY_PREFIX}${query.toLowerCase()}|${limit}|${coords ? `${coords.lat},${coords.lng}` : ''}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  // Galerie déjà filtrée lors d'une session précédente : ni Wikimedia ni
  // agent photo à refaire. Une base indisponible ne doit rien casser.
  if (galleryStore) {
    const stored = await galleryStore.get(key).catch((error) => {
      logger.warn({ error, context: 'gallery-store' }, 'Gallery read failed');
      return null;
    });
    if (stored && stored.length > 0) {
      cacheSet(key, stored);
      return stored;
    }
  }

  // 1) Position → photos réellement prises sur place. Si Commons répond, on
  // s'arrête là : la recherche par mot-clé qui suit n'a aucune notion de lieu
  // et produit des hors-sujet (« Petit Ballon » → ballons de baudruche).
  if (coords) {
    // On récupère large : l'agent correcteur va en écarter une partie
    const candidates = await findCommonsMedia(coords.lat, coords.lng, limit * 2);
    if (candidates.length > 0) {
      const [ranked = []] = await rankPlacePhotos([{ place: query, candidates }], provider);
      const geo = diversifyByAuthor(ranked, limit).map(toPlaceMedia);
      if (geo.length > 0) {
        cacheSet(key, geo);
        void persist(key, query, geo);
        return geo;
      }
    }
  }

  const photos: PlaceMedia[] = [];
  const unsplashKey = process.env['UNSPLASH_ACCESS_KEY'];
  if (unsplashKey && !unsplashKey.startsWith('xxx')) {
    try {
      const res = await fetch(
        `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=${limit}&orientation=portrait`,
        { headers: { Authorization: `Client-ID ${unsplashKey}` } },
      );
      if (res.ok) {
        const data = (await res.json()) as {
          results?: {
            urls?: { regular?: string; thumb?: string };
            links?: { html?: string };
            user?: { name?: string };
          }[];
        };
        for (const item of data.results ?? []) {
          const url = item.urls?.regular;
          if (!url) continue;
          photos.push({
            type: 'photo',
            url,
            thumb: item.urls?.thumb ?? url,
            author: item.user?.name ?? 'Unsplash',
            link: item.links?.html ?? 'https://unsplash.com',
            source: 'unsplash',
          });
        }
      }
    } catch (error) {
      logger.warn({ error, context: 'gallery-unsplash' }, 'Unsplash gallery failed');
    }
  }

  if (photos.length < limit) {
    const pexelsKey = process.env['PEXELS_API_KEY'];
    if (pexelsKey && !pexelsKey.startsWith('xxx')) {
      try {
        const res = await fetch(
          `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${limit - photos.length}&orientation=portrait`,
          { headers: { Authorization: pexelsKey } },
        );
        if (res.ok) {
          const data = (await res.json()) as {
            photos?: {
              src?: { large?: string; tiny?: string };
              url?: string;
              photographer?: string;
            }[];
          };
          for (const item of data.photos ?? []) {
            const url = item.src?.large;
            if (!url) continue;
            photos.push({
              type: 'photo',
              url,
              thumb: item.src?.tiny ?? url,
              author: item.photographer ?? 'Pexels',
              link: item.url ?? 'https://pexels.com',
              source: 'pexels',
            });
          }
        }
      } catch (error) {
        logger.warn({ error, context: 'gallery-pexels' }, 'Pexels gallery failed');
      }
    }
  }

  // Les vidéos ferment la galerie : elles coûtent plus cher à charger que
  // les photos, autant les servir après un premier aperçu immédiat.
  const videos = await findPexelsVideos(query, VIDEO_SLOTS);
  const media = [...photos.slice(0, limit), ...videos];

  if (media.length > 0) {
    cacheSet(key, media);
    void persist(key, query, media);
  }
  return media;
}

/**
 * Sélectionne une photo réelle (Unsplash puis Pexels) pour un trip.
 * Retourne null si aucune clé API configurée ou en cas d'échec —
 * le frontend affiche alors un fond dégradé.
 */
export async function findTripPhoto(keywords: string[]): Promise<string | null> {
  const query = `${keywords.join(' ')} landscape adventure`;

  const unsplashKey = process.env['UNSPLASH_ACCESS_KEY'];
  if (unsplashKey && !unsplashKey.startsWith('xxx')) {
    try {
      const res = await fetch(
        `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`,
        { headers: { Authorization: `Client-ID ${unsplashKey}` } },
      );
      if (res.ok) {
        const data = (await res.json()) as { results?: { urls?: { regular?: string } }[] };
        const url = data.results?.[0]?.urls?.regular;
        if (url) return url;
      }
    } catch (error) {
      logger.warn({ error, context: 'photos-unsplash' }, 'Unsplash lookup failed');
    }
  }

  const pexelsKey = process.env['PEXELS_API_KEY'];
  if (pexelsKey && !pexelsKey.startsWith('xxx')) {
    try {
      const res = await fetch(
        `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`,
        { headers: { Authorization: pexelsKey } },
      );
      if (res.ok) {
        const data = (await res.json()) as { photos?: { src?: { large?: string } }[] };
        const url = data.photos?.[0]?.src?.large;
        if (url) return url;
      }
    } catch (error) {
      logger.warn({ error, context: 'photos-pexels' }, 'Pexels lookup failed');
    }
  }

  return null;
}

/** Un point du trip où une photo prise sur place a du sens. */
export interface CoverAnchor {
  title: string;
  lat: number;
  lng: number;
}

interface CoverTrip {
  waypoints: { name: string; lat: number; lng: number; kind?: string | undefined }[];
  days?:
    | { activities: { type: string; title: string; lat: number; lng: number }[] }[]
    | undefined;
}

/**
 * Points d'ancrage d'une couverture, du plus parlant au moins parlant : les
 * randos des journées (le paysage y est le sujet), puis les visites (souvent
 * un centre-ville : « Des Dolomites aux lacs » recevait Bolzano plutôt que le
 * Seceda), puis les étapes du tracé hors départ/arrivée, puis le reste.
 * Deux points à moins de ~300 m comptent pour un seul.
 */
export function coverAnchors(trip: CoverTrip): CoverAnchor[] {
  const activities = (trip.days ?? []).flatMap((day) => day.activities);
  const ordered: CoverAnchor[] = [];
  for (const type of ['hike', 'visit']) {
    for (const a of activities) {
      if (a.type === type) ordered.push({ title: a.title, lat: a.lat, lng: a.lng });
    }
  }
  const stages = trip.waypoints.filter((w) => w.kind !== 'start' && w.kind !== 'end');
  for (const w of [...stages, ...trip.waypoints]) {
    ordered.push({ title: w.name, lat: w.lat, lng: w.lng });
  }
  const picked: CoverAnchor[] = [];
  for (const a of ordered) {
    if (!Number.isFinite(a.lat) || !Number.isFinite(a.lng)) continue;
    const dup = picked.some((p) => Math.abs(p.lat - a.lat) < 0.003 && Math.abs(p.lng - a.lng) < 0.003);
    if (!dup) picked.push(a);
  }
  return picked;
}

/**
 * Vues classées d'un point, gardées 15 min : les trois propositions d'une
 * génération partagent leurs temps forts, et le jour 1 reprend souvent le
 * point de la couverture. On garde la promesse : deux demandes simultanées du
 * même point ne paient qu'une fois Commons et l'agent.
 */
const viewCache = new Map<string, { at: number; views: Promise<PhotoCandidate[]> }>();
const VIEW_TTL_MS = 15 * 60 * 1000;
const VIEW_MAX_ENTRIES = 500;
/** Candidates cherchées par point pour une couverture ou une photo du jour. */
const VIEW_CANDIDATES = 8;

function anchorKey(anchor: CoverAnchor): string {
  return `${anchor.lat.toFixed(3)},${anchor.lng.toFixed(3)}`;
}

/**
 * Vues d'ensemble de plusieurs points à la fois : Commons point par point
 * (trois requêtes simultanées au plus), puis l'agent photo par lots. Pour
 * chaque point, les photos gardées, la plus parlante en tête.
 */
async function viewsAt(
  anchors: CoverAnchor[],
  provider: LlmProvider | null,
): Promise<PhotoCandidate[][]> {
  const now = Date.now();
  // Les réponses de cet appel, tenues ici : l'éviction du cache ne les perd pas
  const views = new Map<string, Promise<PhotoCandidate[]>>();
  const missing = new Map<string, CoverAnchor>();
  for (const anchor of anchors) {
    const key = anchorKey(anchor);
    const hit = viewCache.get(key);
    if (hit && now - hit.at <= VIEW_TTL_MS) views.set(key, hit.views);
    else missing.set(key, anchor);
  }
  if (missing.size > 0) {
    const pending = [...missing];
    const ranked = Promise.all(
      pending.map(async ([, anchor]) => ({
        place: anchor.title,
        candidates: await findCommonsMedia(anchor.lat, anchor.lng, VIEW_CANDIDATES),
      })),
    ).then((places) => rankPlacePhotos(places, provider));
    pending.forEach(([key], i) => {
      const result = ranked.then((lists) => lists[i] ?? [], () => []);
      views.set(key, result);
      viewCache.delete(key);
      if (viewCache.size >= VIEW_MAX_ENTRIES) {
        const oldest = viewCache.keys().next().value;
        if (oldest !== undefined) viewCache.delete(oldest);
      }
      viewCache.set(key, { at: now, views: result });
    });
  }
  return Promise.all(anchors.map((anchor) => views.get(anchorKey(anchor)) ?? []));
}

/**
 * Pour chaque emplacement (une couverture, une journée), la meilleure vue du
 * premier de ses points qui en offre une. Les points sont essayés par vagues :
 * le suivant n'est payé que pour les emplacements restés sans photo.
 */
async function firstViews(
  slots: CoverAnchor[][],
  provider: LlmProvider | null,
): Promise<(PhotoCandidate | undefined)[]> {
  const picked: (PhotoCandidate | undefined)[] = slots.map(() => undefined);
  const depth = Math.max(0, ...slots.map((anchors) => anchors.length));
  for (let round = 0; round < depth; round += 1) {
    const open = slots.flatMap((anchors, slot) => {
      const anchor = anchors[round];
      return !picked[slot] && anchor ? [{ slot, anchor }] : [];
    });
    if (open.length === 0) break;
    const views = await viewsAt(
      open.map(({ anchor }) => anchor),
      provider,
    );
    open.forEach(({ slot }, k) => {
      picked[slot] = views[k]?.[0];
    });
  }
  return picked;
}

/**
 * Couverture d'un trip : la meilleure vue d'ensemble RÉELLEMENT prise sur l'un
 * de ses temps forts (Commons par coordonnées — un trip Vosges recevait Annecy
 * et les Alpes par mots-clés), validée par l'agent photo ; sinon la recherche
 * par mots-clés de région. Deux points au plus par trip.
 */
export async function findTripCover(
  trip: CoverTrip,
  keywords: string[],
  provider: LlmProvider | null = null,
): Promise<string | null> {
  const [view] = await firstViews([coverAnchors(trip).slice(0, 2)], provider);
  return view?.url ?? findTripPhoto(keywords);
}

/**
 * Jours complétés par mots-clés en parallèle : un grand tour de 16 jours
 * restait des dizaines de secondes sur « Recherche des photos… » jour après
 * jour. Commons, lui, est borné par withCommonsSlot.
 */
const DAY_PHOTO_CONCURRENCY = 3;

/** Applique `task` à chaque élément, jamais plus de `limit` en même temps. */
async function forEachWithLimit<T>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++]!;
      await task(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

type DayActivity = { type: string; title: string; lat?: number | undefined; lng?: number | undefined };

/**
 * Points d'une journée à photographier : les randos d'abord (le paysage y est
 * le sujet), puis les visites, puis le reste — un centre-ville passe après le
 * sentier du même jour.
 */
function dayAnchors(activities: DayActivity[]): CoverAnchor[] {
  const rank = (type: string) => (type === 'hike' ? 0 : type === 'visit' ? 1 : 2);
  const located = activities
    .flatMap((a) =>
      typeof a.lat === 'number' && typeof a.lng === 'number' && Number.isFinite(a.lat) && Number.isFinite(a.lng)
        ? [{ rank: rank(a.type), anchor: { title: a.title, lat: a.lat, lng: a.lng } }]
        : [],
    )
    .sort((a, b) => a.rank - b.rank);
  const seen = new Set<string>();
  return located.flatMap(({ anchor }) => {
    const key = anchorKey(anchor);
    if (seen.has(key)) return [];
    seen.add(key);
    return [anchor];
  });
}

/**
 * Photo par étape (roadmap 2.3) : la meilleure vue d'ensemble prise sur place
 * autour des temps forts du jour, validée par l'agent photo ; à défaut,
 * mots-clés = temps fort + région du trip. Appelé pour UN SEUL trip (le
 * premier visible) afin de rester dans les quotas.
 */
export async function findDayPhotos(
  days: {
    title: string;
    activities: DayActivity[];
    photo_url?: string | undefined;
  }[],
  baseKeywords: string[],
  provider: LlmProvider | null = null,
): Promise<void> {
  const region = baseKeywords[0] ?? '';
  const views = await firstViews(
    days.map((day) => dayAnchors(day.activities).slice(0, 2)),
    provider,
  );
  await forEachWithLimit(
    days.map((day, i) => ({ day, view: views[i] })),
    DAY_PHOTO_CONCURRENCY,
    async ({ day, view }) => {
      const highlight =
        day.activities.find((a) => a.type === 'hike' || a.type === 'visit') ?? day.activities[0];
      if (!highlight) return;
      day.photo_url = view?.url ?? (await findTripPhoto([region, highlight.title])) ?? undefined;
    },
  );
}
