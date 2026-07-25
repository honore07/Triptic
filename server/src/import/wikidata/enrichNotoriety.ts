/**
 * Enrichissement Wikidata (phase B) : pour chaque lieu lié à Wikidata,
 * recalcule la notoriété d'après le nombre de sitelinks (articles Wikipédia)
 * et complète le résumé avec la description française si absente.
 *
 * Usage : pnpm enrich:wikidata
 * Relançable à volonté (idempotent).
 */
import { logger } from '../../logger.js';
import { env } from '../../env.js';
import { PgPlaceRepo } from '../../repo/places.js';
import { chunk, notorietyFromSitelinks } from './wikidataUtils.js';

const API = 'https://www.wikidata.org/w/api.php';
const USER_AGENT = 'TRIPTIC/0.1 (https://triptic.app; contact@triptic.app)';
const BATCH = 50; // limite wbgetentities
const PAUSE_MS = 1500;

interface WikidataEntity {
  sitelinks?: Record<string, unknown>;
  descriptions?: { fr?: { value: string } };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchEntities(ids: string[]): Promise<Record<string, WikidataEntity>> {
  const url = `${API}?action=wbgetentities&ids=${ids.join('|')}&props=sitelinks|descriptions&languages=fr&format=json`;
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) throw new Error(`Wikidata HTTP ${response.status}`);
  const data = (await response.json()) as { entities?: Record<string, WikidataEntity> };
  return data.entities ?? {};
}

async function main(): Promise<void> {
  if (!env.databaseUrl) {
    logger.error('DATABASE_URL manquant — enrichissement impossible');
    process.exit(1);
  }
  const repo = new PgPlaceRepo(env.databaseUrl);
  const rows = await repo.listWikidataIds();
  logger.info({ count: rows.length }, 'Lieux à enrichir via Wikidata');

  // Un même QID peut être partagé par plusieurs lignes (fusions) — grouper.
  const byQid = new Map<string, string[]>();
  for (const row of rows) {
    const list = byQid.get(row.wikidata_id) ?? [];
    list.push(row.id);
    byQid.set(row.wikidata_id, list);
  }

  let updated = 0;
  for (const ids of chunk([...byQid.keys()], BATCH)) {
    const entities = await fetchEntities(ids);
    for (const qid of ids) {
      const entity = entities[qid];
      if (!entity) continue;
      const sitelinks = Object.keys(entity.sitelinks ?? {}).length;
      const notoriety = notorietyFromSitelinks(sitelinks);
      const summary = entity.descriptions?.fr?.value ?? null;
      for (const placeId of byQid.get(qid) ?? []) {
        await repo.applyEnrichment(placeId, notoriety, summary);
        updated += 1;
      }
    }
    await sleep(PAUSE_MS);
  }

  logger.info({ updated }, 'Enrichissement Wikidata terminé');
  process.exit(0);
}

main().catch((error) => {
  logger.error({ error }, 'Enrichissement Wikidata échoué');
  process.exit(1);
});
