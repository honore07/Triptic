/**
 * Import DATAtourisme → table places (phase B).
 *
 * Deux modes :
 *   pnpm import:datatourisme                          # télécharge le flux (env DATATOURISME_WEBSERVICE_URL)
 *   pnpm import:datatourisme -- --dir=/chemin/extrait # archive déjà extraite (index.json + objects/)
 *
 * Le flux DATAtourisme est une archive zip JSON-LD : un index + un fichier
 * par POI. Dédoublonnage inter-sources (fusion si déjà connu via OSM).
 */
import fs from 'node:fs';
import path from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import { logger } from '../../logger.js';
import { env } from '../../env.js';
import { PgPlaceRepo, type PlaceInput } from '../../repo/places.js';
import { datatourismeToPlace } from './parse.js';

function parseArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

/** Fichiers POI d'une archive extraite sur disque (objects/**.json). */
function* readDir(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile() && entry.name.endsWith('.json') && entry.name !== 'index.json') {
      yield fs.readFileSync(path.join(entry.parentPath, entry.name), 'utf8');
    }
  }
}

/** Fichiers POI d'une archive zip téléchargée (en mémoire). */
function* readZip(buffer: Uint8Array): Generator<string> {
  const files = unzipSync(buffer);
  for (const [name, content] of Object.entries(files)) {
    if (name.endsWith('.json') && !name.endsWith('index.json')) {
      yield strFromU8(content);
    }
  }
}

async function main(): Promise<void> {
  if (!env.databaseUrl) {
    logger.error('DATABASE_URL manquant — import impossible');
    process.exit(1);
  }
  const dir = parseArg('dir');
  const fluxUrl = process.env['DATATOURISME_WEBSERVICE_URL'];
  if (!dir && !fluxUrl) {
    logger.error(
      'Fournir --dir=<archive extraite> ou DATATOURISME_WEBSERVICE_URL dans .env',
    );
    process.exit(1);
  }

  let files: Generator<string>;
  if (dir) {
    files = readDir(dir);
  } else {
    logger.info({ fluxUrl: 'défini' }, 'Téléchargement du flux DATAtourisme…');
    const response = await fetch(fluxUrl as string);
    if (!response.ok) throw new Error(`Flux DATAtourisme HTTP ${response.status}`);
    files = readZip(new Uint8Array(await response.arrayBuffer()));
  }

  const repo = new PgPlaceRepo(env.databaseUrl);
  const batch: PlaceInput[] = [];
  let parsed = 0;
  let skipped = 0;
  let inserted = 0;
  let merged = 0;

  const flush = async (): Promise<void> => {
    if (batch.length === 0) return;
    const result = await repo.upsertWithDedup(batch.splice(0));
    inserted += result.inserted;
    merged += result.merged;
  };

  for (const raw of files) {
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      skipped += 1;
      continue;
    }
    const place = datatourismeToPlace(obj);
    if (!place) {
      skipped += 1;
      continue;
    }
    parsed += 1;
    batch.push(place);
    if (batch.length >= 200) await flush();
  }
  await flush();

  logger.info({ parsed, skipped, inserted, merged }, 'Import DATAtourisme terminé');
  process.exit(0);
}

main().catch((error) => {
  logger.error({ error }, 'Import DATAtourisme échoué');
  process.exit(1);
});
