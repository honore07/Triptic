import { logger } from '../logger.js';

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
