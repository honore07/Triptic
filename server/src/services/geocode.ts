import { logger } from '../logger.js';
import { regionForPoint, type Bbox } from '../import/osm/regions.js';

/**
 * Géocodage de NOMS de lieux via Nominatim (OSM) — repli du pipeline TDM
 * blogs quand un fait n'a ni coordonnées dans le texte, ni équivalent déjà
 * cartographié dans notre base. Les blogs ne donnent quasi jamais de GPS :
 * sans cette étape, les faits sont ignorés faute de point.
 *
 * Garanties (usage policy Nominatim + qualité) :
 *  - User-Agent identifiable avec contact, max 1 req/s (throttle interne)
 *  - jamais de point HORS périmètre pilote (post-filtre regionForPoint)
 *  - recherche bornée à la bbox de la zone si fournie (réduit les homonymes)
 *  - cache mémoire par nom pour ne pas re-géocoder dans un même run
 * Un lieu géocodé n'est PAS recoupé par notre base ⇒ l'agent de conformité le
 * met en quarantaine (pending) : garde-fou contre les faux positifs d'homonymes.
 */

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT =
  'TRIPTIC-TDM/0.1 (+https://triptic.app/legal/tdm; contact: contact@triptic.app)';
const MIN_INTERVAL_MS = 1100; // politesse Nominatim (1 req/s max)

let lastCallAt = 0;
const cache = new Map<string, { lat: number; lng: number } | null>();

async function throttle(): Promise<void> {
  const wait = MIN_INTERVAL_MS - (Date.now() - lastCallAt);
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastCallAt = Date.now();
}

export async function geocodePlace(
  name: string,
  bbox?: Bbox,
  fetchImpl: typeof fetch = fetch,
): Promise<{ lat: number; lng: number } | null> {
  const key = `${name.toLowerCase()}|${bbox ? `${bbox.south},${bbox.west}` : 'pilot'}`;
  if (cache.has(key)) return cache.get(key) ?? null;

  const params = new URLSearchParams({
    q: name,
    format: 'jsonv2',
    limit: '1',
    countrycodes: 'fr,de,ch,it',
  });
  if (bbox) {
    params.set('viewbox', `${bbox.west},${bbox.south},${bbox.east},${bbox.north}`);
    params.set('bounded', '1');
  }

  await throttle();
  let result: { lat: number; lng: number } | null = null;
  try {
    const res = await fetchImpl(`${NOMINATIM_URL}?${params.toString()}`, {
      headers: { 'User-Agent': USER_AGENT },
    });
    if (res.ok) {
      const data = (await res.json()) as { lat?: string; lon?: string }[];
      const top = data[0];
      if (top?.lat && top?.lon) {
        const lat = Number(top.lat);
        const lng = Number(top.lon);
        // Jamais de point hors périmètre pilote (homonyme lointain écarté).
        if (Number.isFinite(lat) && Number.isFinite(lng) && regionForPoint(lat, lng) !== null) {
          result = { lat, lng };
        }
      }
    }
  } catch (error) {
    logger.warn({ error, name }, 'Géocodage Nominatim échoué');
  }
  cache.set(key, result);
  return result;
}
