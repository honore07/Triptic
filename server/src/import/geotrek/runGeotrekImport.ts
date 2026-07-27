/**
 * Import Geotrek APIv2 → table places, kind 'trail' avec trace (roadmap 5.1).
 *
 * Usage (depuis server/) :
 *   pnpm import:geotrek                      # tous les portails déclarés
 *   pnpm import:geotrek -- --portal=rando-ecrins
 *
 * Idempotent (upsert source/source_id + dédup inter-sources). L'attribution
 * de chaque portail est conservée dans portals.ts (Etalab/ODbL).
 */
import { env } from '../../env.js';
import { logger } from '../../logger.js';
import { PgPlaceRepo, type PlaceInput } from '../../repo/places.js';
import { GEOTREK_PORTALS } from './portals.js';
import { trekToPlace, type GeotrekTrek } from './parseTrek.js';

const PAGE_SIZE = 50;
/** Pause de politesse entre pages (instances publiques de parcs). */
const PAUSE_MS = 1500;

function parseArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface TrekPage {
  next: string | null;
  results: GeotrekTrek[];
}

async function main(): Promise<void> {
  if (!env.databaseUrl) {
    logger.error('DATABASE_URL manquant — import impossible');
    process.exit(1);
  }
  const portalFilter = parseArg('portal');
  const portals = GEOTREK_PORTALS.filter((p) => !portalFilter || p.id === portalFilter);
  if (portals.length === 0) {
    logger.error({ portalFilter }, 'Portail inconnu (voir import/geotrek/portals.ts)');
    process.exit(1);
  }

  const repo = new PgPlaceRepo(env.databaseUrl);
  let inserted = 0;
  let merged = 0;
  let skipped = 0;

  for (const portal of portals) {
    let url: string | null =
      `${portal.baseUrl}/api/v2/trek/?format=json&page_size=${PAGE_SIZE}` +
      `&fields=id,name,description_teaser,length_2d,ascent,duration,geometry`;
    let portalCount = 0;
    while (url) {
      try {
        const response = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const page = (await response.json()) as TrekPage;
        const places = page.results
          .map((trek) => trekToPlace(trek, portal))
          .filter((p): p is PlaceInput => p !== null);
        skipped += page.results.length - places.length;
        if (places.length > 0) {
          const result = await repo.upsertWithDedup(places);
          inserted += result.inserted;
          merged += result.merged;
          portalCount += places.length;
        }
        url = page.next;
      } catch (error) {
        logger.warn(
          { portal: portal.id, url, error: String(error) },
          'Import Geotrek — page échouée, portail suivant (script relançable)',
        );
        url = null;
      }
      await sleep(PAUSE_MS);
    }
    logger.info({ portal: portal.id, count: portalCount }, 'Import Geotrek — portail terminé');
  }

  logger.info({ inserted, merged, skipped }, 'Import Geotrek terminé');
  process.exit(0);
}

main().catch((error) => {
  logger.error({ error }, 'Import Geotrek échoué');
  process.exit(1);
});
