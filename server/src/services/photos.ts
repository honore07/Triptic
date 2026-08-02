import { logger } from '../logger.js';

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
 * Cache mémoire des galeries : le quota Unsplash gratuit est de 50 req/h,
 * or une carte de trip interroge un lieu par marqueur ouvert. TTL 24 h,
 * suffisant (les photos d'un lieu ne bougent pas) et borné en taille.
 */
const galleryCache = new Map<string, { at: number; media: PlaceMedia[] }>();
const GALLERY_TTL_MS = 24 * 60 * 60 * 1000;
const GALLERY_MAX_ENTRIES = 500;
/** Nombre de vidéos ajoutées en fin de galerie, en plus des photos. */
const VIDEO_SLOTS = 3;

function cacheGet(key: string): PlaceMedia[] | null {
  const hit = galleryCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > GALLERY_TTL_MS) {
    galleryCache.delete(key);
    return null;
  }
  return hit.media;
}

function cacheSet(key: string, media: PlaceMedia[]): void {
  if (galleryCache.size >= GALLERY_MAX_ENTRIES) {
    const oldest = galleryCache.keys().next().value;
    if (oldest !== undefined) galleryCache.delete(oldest);
  }
  galleryCache.set(key, { at: Date.now(), media });
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
export function diversifyByAuthor(media: PlaceMedia[], limit: number): PlaceMedia[] {
  const byAuthor = new Map<string, PlaceMedia[]>();
  for (const item of media) {
    const list = byAuthor.get(item.author);
    if (list) list.push(item);
    else byAuthor.set(item.author, [item]);
  }
  const picked: PlaceMedia[] = [];
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
 * Photos géolocalisées via Wikimedia Commons — source PRINCIPALE.
 * Les recherches par mot-clé (Unsplash/Pexels) confondent le nom du lieu
 * avec son sens commun : « Petit Ballon » renvoyait des ballons de baudruche.
 * Ici c'est la position qui sélectionne les photos, donc le lieu est juste
 * par construction.
 */
export async function findCommonsMedia(
  lat: number,
  lng: number,
  limit: number,
  radiusM = 4000,
): Promise<PlaceMedia[]> {
  const url =
    `https://commons.wikimedia.org/w/api.php?action=query&generator=geosearch` +
    // On demande large pour pouvoir répartir entre auteurs ensuite
    `&ggscoord=${lat}%7C${lng}&ggsradius=${radiusM}&ggslimit=${Math.min(limit * 4, 50)}&ggsnamespace=6` +
    `&prop=imageinfo&iiprop=url%7Cextmetadata&iiurlwidth=900&format=json&origin=*`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': COMMONS_UA } });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      query?: {
        pages?: Record<
          string,
          {
            title?: string;
            imageinfo?: {
              thumburl?: string;
              url?: string;
              descriptionurl?: string;
              extmetadata?: Record<string, { value?: string }>;
            }[];
          }
        >;
      };
    };
    const found: PlaceMedia[] = [];
    for (const page of Object.values(data.query?.pages ?? {})) {
      const info = page.imageinfo?.[0];
      const display = info?.thumburl ?? info?.url;
      if (!display) continue;
      // Les fichiers non photographiques (cartes, blasons) desservent l'aperçu
      if (!/\.(jpe?g|png)$/i.test(page.title ?? '')) continue;
      const meta = info?.extmetadata ?? {};
      found.push({
        type: 'photo',
        url: display,
        thumb: display,
        author: stripHtml(meta['Artist']?.value ?? '') || 'Wikimedia Commons',
        link: info?.descriptionurl ?? 'https://commons.wikimedia.org',
        source: 'commons',
        license: stripHtml(meta['LicenseShortName']?.value ?? '') || undefined,
      });
    }
    return diversifyByAuthor(found, limit);
  } catch (error) {
    logger.warn({ error, context: 'gallery-commons' }, 'Commons geosearch failed');
    return [];
  }
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
}

/**
 * Galerie d'un lieu (carrousel carte) : Unsplash puis complétée par Pexels
 * jusqu'à `limit`. Retourne [] si aucune clé configurée ou en cas d'échec —
 * l'UI retombe alors sur le marqueur simple, sans carrousel.
 */
export async function findPlacePhotos(
  query: string,
  limit = 10,
  coords?: { lat: number; lng: number } | undefined,
): Promise<PlaceMedia[]> {
  const key = `${query.toLowerCase()}|${limit}|${coords ? `${coords.lat},${coords.lng}` : ''}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  // 1) Position → photos réellement prises sur place. Si Commons répond, on
  // s'arrête là : la recherche par mot-clé qui suit n'a aucune notion de lieu
  // et produit des hors-sujet (« Petit Ballon » → ballons de baudruche).
  if (coords) {
    const geo = await findCommonsMedia(coords.lat, coords.lng, limit);
    if (geo.length > 0) {
      cacheSet(key, geo);
      return geo;
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

  if (media.length > 0) cacheSet(key, media);
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

/**
 * Photo par étape (roadmap 2.3) : une requête par jour, mots-clés = temps
 * fort du jour + région du trip. Appelé pour UN SEUL trip (le premier
 * visible) afin de rester dans les quotas Unsplash/Pexels. Sans clé API,
 * findTripPhoto répond null immédiatement — fallback dégradé côté UI.
 */
export async function findDayPhotos(
  days: { title: string; activities: { type: string; title: string }[]; photo_url?: string | undefined }[],
  baseKeywords: string[],
): Promise<void> {
  const region = baseKeywords[0] ?? '';
  await Promise.all(
    days.map(async (day) => {
      const highlight =
        day.activities.find((a) => a.type === 'hike' || a.type === 'visit') ??
        day.activities[0];
      if (!highlight) return;
      day.photo_url = (await findTripPhoto([region, highlight.title])) ?? undefined;
    }),
  );
}
