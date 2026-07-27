/**
 * Import des boucles rando OSM (relations route=hiking/foot/walking) →
 * table places kind 'trail' avec trace (roadmap 5.1).
 *
 * Usage (depuis server/) :
 *   pnpm import:osm-trails
 *   pnpm import:osm-trails -- --region=alsace-vosges
 *
 * Idempotent. Exclut les GR/GRP/PR (propriété FFRandonnée — garde-fou légal).
 * Si OPENTOPODATA_URL est configuré, le dénivelé est calculé à l'import.
 */
import { env } from '../../env.js';
import { logger } from '../../logger.js';
import { PgPlaceRepo, type PlaceInput } from '../../repo/places.js';
import { ElevationService } from '../../services/elevation.js';
import { IMPORT_REGIONS } from './regions.js';
import { fetchOverpass } from './overpassClient.js';
import {
  buildTrailQuery,
  isFfrpProtected,
  trailRelationToPlace,
  type OverpassRelation,
} from './trailRelations.js';

const PAUSE_MS = 10000;

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
  const elevation = new ElevationService(process.env['OPENTOPODATA_URL'] ?? null);
  const regionFilter = parseArg('region');
  const regions = IMPORT_REGIONS.filter((r) => !regionFilter || r.id === regionFilter);

  let total = 0;
  let excludedFfrp = 0;
  let failures = 0;
  for (const region of regions) {
    for (const bbox of region.bboxes) {
      try {
        const elements = (await fetchOverpass(buildTrailQuery(bbox))) as unknown as OverpassRelation[];
        const places: PlaceInput[] = [];
        for (const relation of elements) {
          if (relation.tags && isFfrpProtected(relation.tags)) {
            excludedFfrp += 1;
            continue;
          }
          const place = trailRelationToPlace(relation);
          if (!place) continue;
          // Dénivelé depuis le DEM self-hosted quand disponible (5.3)
          if (elevation.enabled && place.trace) {
            const gain = await elevation.elevationGain(place.trace);
            if (gain !== null && place.summary) {
              place.summary = `${place.summary} · ${gain} m D+`.slice(0, 200);
            }
          }
          places.push(place);
        }
        if (places.length > 0) await repo.upsertWithDedup(places);
        total += places.length;
        logger.info({ region: region.id, bbox, count: places.length }, 'Trails importés (bbox)');
      } catch (error) {
        failures += 1;
        logger.warn(
          { region: region.id, bbox, error: String(error) },
          'Import trails — bbox échouée, on continue (relançable)',
        );
      }
      await sleep(PAUSE_MS);
    }
  }

  logger.info({ total, excludedFfrp, failures }, 'Import trails OSM terminé');
  process.exit(0);
}

main().catch((error) => {
  logger.error({ error }, 'Import trails OSM échoué');
  process.exit(1);
});
