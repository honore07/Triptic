/**
 * Import des villages classés (phase B) :
 *   - "Les Plus Beaux Villages de France" (wd:Q1010307)
 *   - "I borghi più belli d'Italia"      (wd:Q127107)
 * (Pas d'équivalent suisse structuré sur Wikidata à ce jour.)
 *
 * Usage : pnpm import:villages
 * Seuls les villages dans le périmètre pilote (bbox) sont importés.
 */
import { logger } from '../../logger.js';
import { env } from '../../env.js';
import { PgPlaceRepo, type PlaceInput } from '../../repo/places.js';
import { regionForPoint } from '../osm/regions.js';
import { parseWktPoint } from './wikidataUtils.js';

const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';
const USER_AGENT = 'TRIPTIC/0.1 (https://triptic.app; contact@triptic.app)';

const VILLAGE_LISTS = [
  { qid: 'Q1010307', label: 'Plus Beaux Villages de France' },
  { qid: 'Q127107', label: 'Borghi più belli d’Italia' },
];

interface SparqlBinding {
  item: { value: string };
  itemLabel: { value: string };
  coord: { value: string };
}

async function fetchVillages(listQid: string): Promise<SparqlBinding[]> {
  const query = `
    SELECT ?item ?itemLabel ?coord WHERE {
      ?item wdt:P463 wd:${listQid} .
      ?item wdt:P625 ?coord .
      SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,it,de,en". }
    }`;
  const response = await fetch(
    `${SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}&format=json`,
    { headers: { 'User-Agent': USER_AGENT, Accept: 'application/sparql-results+json' } },
  );
  if (!response.ok) throw new Error(`SPARQL HTTP ${response.status}`);
  const data = (await response.json()) as { results: { bindings: SparqlBinding[] } };
  return data.results.bindings;
}

export function villageToPlace(
  binding: SparqlBinding,
  listLabel: string,
): PlaceInput | null {
  const point = parseWktPoint(binding.coord.value);
  if (!point) return null;
  const region = regionForPoint(point.lat, point.lng);
  if (!region) return null;
  const qid = binding.item.value.split('/').pop() as string;
  return {
    name: binding.itemLabel.value,
    kind: 'village',
    lat: point.lat,
    lng: point.lng,
    region,
    tags: ['village', 'patrimoine', 'culture'],
    summary: `Classé « ${listLabel} »`,
    notoriety: 75,
    confidence: 85,
    status: 'active',
    source: 'wikidata',
    source_id: qid,
    source_url: binding.item.value,
    wikidata_id: qid,
  };
}

async function main(): Promise<void> {
  if (!env.databaseUrl) {
    logger.error('DATABASE_URL manquant — import impossible');
    process.exit(1);
  }
  const repo = new PgPlaceRepo(env.databaseUrl);
  let totalInserted = 0;
  let totalMerged = 0;

  for (const list of VILLAGE_LISTS) {
    const bindings = await fetchVillages(list.qid);
    const places = bindings
      .map((b) => villageToPlace(b, list.label))
      .filter((p): p is PlaceInput => p !== null);
    const { inserted, merged } = await repo.upsertWithDedup(places);
    totalInserted += inserted;
    totalMerged += merged;
    logger.info(
      { list: list.label, fetched: bindings.length, kept: places.length, inserted, merged },
      'Import villages — liste terminée',
    );
  }

  logger.info({ totalInserted, totalMerged }, 'Import villages terminé');
  process.exit(0);
}

// Exécution directe uniquement (le module est aussi importé par les tests)
if (process.argv[1]?.includes('importVillages')) {
  main().catch((error) => {
    logger.error({ error }, 'Import villages échoué');
    process.exit(1);
  });
}
