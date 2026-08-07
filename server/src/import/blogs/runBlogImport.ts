/**
 * Pipeline blogs → fiches de données (roadmap 6) — TOUJOURS gated par
 * l'agent de conformité (6.7) : aucune fiche 'active' sans son feu vert.
 *
 * Usage (depuis server/) :
 *   pnpm import:blog -- --url=https://blog-exemple.fr/article-vosges
 *
 * Flow par page : registre source (exclusion/plafond) → opt-out (robots.txt,
 * ai.txt, meta noai/TDMRep) → extraction de FAITS structurés (jamais de
 * texte) → détecteur de copie + filtre RGPD → recoupement OSM/DATAtourisme/
 * Wikidata → agent de conformité → insertion (active | pending | rejeté).
 * Chaque décision est journalisée (audit trail Pino).
 */
import { createProviderFromEnv } from '@triptic/ai-engine';
import { env } from '../../env.js';
import { logger } from '../../logger.js';
import { PgPlaceRepo, type PlaceInput } from '../../repo/places.js';
import { PgTdmRepo } from '../../repo/tdm.js';
import { reviewFact, statusForDecision } from '../../agents/complianceAgent.js';
import { checkOptOut, extractFacts, htmlToText } from '../../services/blogMining.js';
import { geocodePlace } from '../../services/geocode.js';
import { IMPORT_REGIONS, regionForPoint } from '../osm/regions.js';

function parseArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

async function main(): Promise<void> {
  if (!env.databaseUrl) {
    logger.error('DATABASE_URL manquant — import impossible');
    process.exit(1);
  }
  const url = parseArg('url');
  if (!url) {
    logger.error('Fournir --url=<page de blog à fouiller>');
    process.exit(1);
  }
  const origin = new URL(url).origin;
  const provider = createProviderFromEnv();
  const placeRepo = new PgPlaceRepo(env.databaseUrl);
  const tdmRepo = new PgTdmRepo(env.databaseUrl);
  const fetchDate = new Date();

  // 1. Registre source : liste d'exclusion + plafond anti-mirroring
  const known = await tdmRepo.getSource(origin);
  if (known?.excluded) {
    logger.warn({ origin }, 'Source sur liste d’exclusion — abandon');
    process.exit(0);
  }

  // 2. Fetch + opt-out (le statut est TOUJOURS enregistré, même en refus)
  const response = await fetch(url, {
    headers: { 'User-Agent': 'TRIPTIC-TDM/0.1 (+https://triptic.app/legal/tdm)' },
  });
  if (!response.ok) {
    logger.error({ url, status: response.status }, 'Page inaccessible');
    process.exit(1);
  }
  const html = await response.text();
  const optOut = await checkOptOut(url, html);
  await tdmRepo.recordCheck(origin, optOut.status, optOut.detail);
  if (optOut.status === 'opted_out') {
    logger.warn({ origin, detail: optOut.detail }, 'Opt-out détecté — source exclue, aucun traitement');
    process.exit(0);
  }

  // 3. Extraction de faits structurés (anti-copie + RGPD intégrés)
  const pageText = htmlToText(html);
  const extraction = await extractFacts(provider, pageText);
  if (extraction.tdmReservation) {
    await tdmRepo.recordCheck(origin, 'opted_out', 'réserve TDM en langage naturel');
    logger.warn({ origin }, 'Réserve TDM dans le texte — source exclue');
    process.exit(0);
  }

  // 4. Résolution des coordonnées + recoupement + agent de conformité, fait par fait.
  // Les blogs ne donnent quasi jamais de GPS : on ancre chaque nom (a) sur un
  // lieu déjà cartographié de même nom, sinon (b) via géocodage Nominatim borné
  // à la zone. Un lieu géocodé n'est pas recoupé ⇒ quarantaine (garde-fou homonymes).
  const regionBbox = IMPORT_REGIONS.find((r) => r.id === parseArg('region'))?.bboxes[0];
  let approved = 0;
  let quarantined = 0;
  let rejected = 0;
  let skippedNoCoords = 0;
  let resolvedDb = 0;
  let resolvedGeo = 0;
  const sourceExtractedCount = known?.extracted_count ?? 0;

  for (const fact of extraction.facts) {
    let lat = fact.lat;
    let lng = fact.lng;
    if (lat === null || lng === null) {
      const dbMatch = await placeRepo.resolveByName(fact.name);
      if (dbMatch) {
        ({ lat, lng } = dbMatch);
        resolvedDb += 1;
      } else {
        const geo = await geocodePlace(fact.name, regionBbox);
        if (geo) {
          ({ lat, lng } = geo);
          resolvedGeo += 1;
        }
      }
    }
    if (lat === null || lng === null) {
      // Ni GPS, ni lieu connu, ni géocodage : rien à insérer.
      skippedNoCoords += 1;
      continue;
    }
    const crossChecked = await tdmRepo.crossCheck(fact.name, lat, lng);
    const verdict = await reviewFact(provider, fact, {
      sourceUrl: url,
      optOut,
      sourceExtractedCount: sourceExtractedCount + approved + quarantined,
      sourceExcluded: known?.excluded ?? false,
      crossChecked,
      pageText,
      fetchDate,
    });
    const status = statusForDecision(verdict.decision);
    if (status === null) {
      rejected += 1;
      continue;
    }
    const place: PlaceInput = {
      name: fact.name,
      kind: fact.kind,
      lat,
      lng,
      region: regionForPoint(lat, lng),
      elevation_m: fact.elevation_m ?? null,
      tags: fact.tags,
      summary: null, // JAMAIS de texte issu du blog
      // Infos pratiques factuelles (faits bruts, pas d'expression)
      price_min_eur: fact.price_min_eur ?? null,
      price_max_eur: fact.price_max_eur ?? null,
      price_free: fact.price_free ?? null,
      best_season: fact.best_season ?? null,
      difficulty: fact.difficulty ?? null,
      notoriety: 25,
      confidence: crossChecked ? 60 : 30,
      status,
      source: 'web',
      source_id: `${url}#${fact.name}`,
      source_url: url,
      opt_out_status: optOut.status,
      fetch_date: fetchDate,
    };
    await placeRepo.upsertWithDedup([place]);
    if (status === 'active') approved += 1;
    else quarantined += 1;
  }

  await tdmRepo.bumpExtracted(origin, approved + quarantined);
  logger.info(
    {
      url,
      facts: extraction.facts.length,
      approved,
      quarantined,
      rejected,
      skippedNoCoords,
      resolvedDb,
      resolvedGeo,
      copyRejected: extraction.rejected,
    },
    'Import blog terminé (gated par l’agent de conformité)',
  );
  process.exit(0);
}

main().catch((error) => {
  logger.error({ error }, 'Import blog échoué');
  process.exit(1);
});
