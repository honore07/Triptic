/** Élément brut renvoyé par Overpass (out tags center). */
export interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements: OverpassElement[];
}

/** Miroirs publics — on alterne en cas d'erreur ou de saturation (429/504). */
const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

const MAX_ATTEMPTS = 6;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Exécute une requête Overpass QL avec retry + rotation de miroir.
 * Backoff progressif : les instances publiques limitent le débit.
 */
export async function fetchOverpass(
  query: string,
  fetchImpl: typeof fetch = fetch,
): Promise<OverpassElement[]> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const mirror = MIRRORS[attempt % MIRRORS.length] as string;
    try {
      const response = await fetchImpl(mirror, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
      });
      if (response.status === 429 || response.status === 504) {
        lastError = new Error(`Overpass ${response.status} on ${mirror}`);
        // 429 = rate limit par IP : attendre longtemps avant de retenter
        await sleep(30000 * (attempt + 1));
        continue;
      }
      if (!response.ok) {
        throw new Error(`Overpass HTTP ${response.status} on ${mirror}`);
      }
      const data = (await response.json()) as OverpassResponse;
      return data.elements ?? [];
    } catch (error) {
      lastError = error;
      await sleep(5000 * (attempt + 1));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Overpass failed');
}
