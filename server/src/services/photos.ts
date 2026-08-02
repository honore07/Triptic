import { logger } from '../logger.js';

/** Une photo de lieu avec son crédit (obligatoire : CGU Unsplash & Pexels). */
export interface PlacePhoto {
  url: string;
  thumb: string;
  author: string;
  /** Page de la photo chez le fournisseur — lien de crédit exigé. */
  link: string;
  source: 'unsplash' | 'pexels';
}

/**
 * Cache mémoire des galeries : le quota Unsplash gratuit est de 50 req/h,
 * or une carte de trip interroge un lieu par marqueur ouvert. TTL 24 h,
 * suffisant (les photos d'un lieu ne bougent pas) et borné en taille.
 */
const galleryCache = new Map<string, { at: number; photos: PlacePhoto[] }>();
const GALLERY_TTL_MS = 24 * 60 * 60 * 1000;
const GALLERY_MAX_ENTRIES = 500;

function cacheGet(key: string): PlacePhoto[] | null {
  const hit = galleryCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > GALLERY_TTL_MS) {
    galleryCache.delete(key);
    return null;
  }
  return hit.photos;
}

function cacheSet(key: string, photos: PlacePhoto[]): void {
  if (galleryCache.size >= GALLERY_MAX_ENTRIES) {
    const oldest = galleryCache.keys().next().value;
    if (oldest !== undefined) galleryCache.delete(oldest);
  }
  galleryCache.set(key, { at: Date.now(), photos });
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
export async function findPlacePhotos(query: string, limit = 10): Promise<PlacePhoto[]> {
  const key = `${query.toLowerCase()}|${limit}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  const photos: PlacePhoto[] = [];
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

  if (photos.length > 0) cacheSet(key, photos);
  return photos;
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
