/**
 * Import OSM → table places (phase A).
 *
 * Usage (depuis server/) :
 *   pnpm import:osm                        # tout le périmètre pilote
 *   pnpm import:osm -- --region=alsace-vosges
 *   pnpm import:osm -- --region=alpes-fr --kind=peak
 *
 * Idempotent : relancer rafraîchit les lieux existants (upsert source/source_id).
 */
import { env } from '../../env.js';
import { logger } from '../../logger.js';
import { PgPlaceRepo, type PlaceInput } from '../../repo/places.js';
import { IMPORT_REGIONS } from './regions.js';
import { OSM_CATEGORIES, buildOverpassQuery } from './categories.js';
import { fetchOverpass } from './overpassClient.js';
import { osmElementToPlace } from './mapElement.js';

/** Pause de politesse entre requêtes Overpass (instances publiques partagées). */
const PAUSE_MS = 3000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

async function main(): Promise<void> {
  if (!env.databaseUrl) {
    logger.error('DATABASE_URL manquant — import impossible');
    process.exit(1);
  }
  const repo = new PgPlaceRepo(env.databaseUrl);

  const regionFilter = parseArg('region');
  const kindFilter = parseArg('kind');
  const regions = IMPORT_REGIONS.filter((r) => !regionFilter || r.id === regionFilter);
  const categories = OSM_CATEGORIES.filter((c) => !kindFilter || c.kind === kindFilter);
  if (regions.length === 0 || categories.length === 0) {
    logger.error({ regionFilter, kindFilter }, 'Filtre région/kind inconnu');
    process.exit(1);
  }

  let total = 0;
  for (const region of regions) {
    for (const category of categories) {
      let regionCategoryCount = 0;
      for (const bbox of region.bboxes) {
        const query = buildOverpassQuery(category, bbox);
        const elements = await fetchOverpass(query);
        const places = elements
          .map((el) => osmElementToPlace(el, category, region.id))
          .filter((p): p is PlaceInput => p !== null);
        if (places.length > 0) await repo.bulkUpsert(places);
        regionCategoryCount += places.length;
        await sleep(PAUSE_MS);
      }
      total += regionCategoryCount;
      logger.info(
        { region: region.id, kind: category.kind, count: regionCategoryCount },
        'Import OSM — catégorie terminée',
      );
    }
  }

  const stats = await repo.stats();
  logger.info({ total, stats }, 'Import OSM terminé');
  process.exit(0);
}

main().catch((error) => {
  logger.error({ error }, 'Import OSM échoué');
  process.exit(1);
});
