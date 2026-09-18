/**
 * Refait les photos des trips déjà enregistrés avec les règles photo en
 * vigueur (agent photo 2.0.0 : vues d'ensemble seulement).
 *
 * Jusqu'en septembre 2026, les couvertures et les photos du jour ne passaient
 * jamais par l'agent : des trips montrent encore une voiture de police à
 * Bolzano, un intérieur d'église à Gérardmer, un train, un bœuf…
 *
 * Usage (depuis server/) :
 *   pnpm photos:refresh           aperçu de ce qui changerait — rien n'est écrit
 *   pnpm photos:refresh --apply   écrit, après avoir enregistré les anciennes
 *                                 URL dans un fichier SQL de retour arrière,
 *                                 rangé dans le dossier personnel (hors dépôt)
 * Seules les URL de photos changent : ni le contenu du trip, ni sa date de
 * modification (l'ordre de « Mes trips » reste le même).
 */
import { writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import postgres from 'postgres';
import { createProviderFromEnv } from '@triptic/ai-engine';
import { env } from '../env.js';
import { logger } from '../logger.js';
import { photoJudgeFromEnv, setPhotoJudge } from '../agents/photoVision.js';
import { findDayPhotos, findTripCover } from '../services/photos.js';

interface StoredDay {
  day: number;
  title: string;
  photo_url?: string | undefined;
  activities: { type: string; title: string; lat: number; lng: number }[];
}

interface TripRow {
  id: string;
  title: string;
  cover_photo: string | null;
  metadata: { photo_url?: string | undefined; photo_keywords?: string[] | undefined } | null;
  days_json: StoredDay[] | null;
  waypoints_json: { name: string; lat: number; lng: number; kind?: string | undefined }[] | null;
}

interface Refresh {
  row: TripRow;
  cover: string | null;
  /** Jours avec leurs nouvelles photos (mêmes index que days_json). */
  days: StoredDay[] | null;
}

/** Nom de fichier lisible d'une URL de photo, pour l'aperçu. */
function label(url: string | null | undefined): string {
  if (!url) return '—';
  try {
    return decodeURIComponent(new URL(url).pathname.split('/').pop() ?? url);
  } catch {
    return url;
  }
}

/** Chaîne SQL littérale, pour le fichier de retour arrière. */
function literal(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function hasChanged({ row, cover, days }: Refresh): boolean {
  return (
    cover !== row.cover_photo ||
    (days ?? []).some((day, i) => day.photo_url !== row.days_json?.[i]?.photo_url)
  );
}

/** Instructions qui remettent les photos d'un trip telles qu'avant. */
function rollbackOf({ row }: Refresh): string[] {
  const id = literal(row.id);
  const statements = [
    `UPDATE trips SET cover_photo = ${row.cover_photo === null ? 'NULL' : literal(row.cover_photo)} WHERE id = ${id};`,
  ];
  if (row.metadata) {
    const old = row.metadata.photo_url;
    statements.push(
      old === undefined
        ? `UPDATE trips SET metadata = metadata #- '{photo_url}' WHERE id = ${id};`
        : `UPDATE trips SET metadata = jsonb_set(metadata, '{photo_url}', to_jsonb(${literal(old)}::text)) WHERE id = ${id};`,
    );
  }
  (row.days_json ?? []).forEach((day, i) => {
    statements.push(
      day.photo_url === undefined
        ? `UPDATE trips SET days_json = days_json #- '{${i},photo_url}' WHERE id = ${id};`
        : `UPDATE trips SET days_json = jsonb_set(days_json, '{${i},photo_url}', to_jsonb(${literal(day.photo_url)}::text)) WHERE id = ${id};`,
    );
  });
  return statements;
}

/** Écrit les nouvelles URL chemin par chemin : rien d'autre du trip n'est réécrit. */
async function applyRefresh(sql: postgres.TransactionSql, { row, cover, days }: Refresh): Promise<void> {
  await sql`
    UPDATE trips
       SET cover_photo = ${cover},
           metadata = CASE
             WHEN metadata IS NULL THEN NULL
             WHEN ${cover}::text IS NULL THEN metadata #- '{photo_url}'
             ELSE jsonb_set(metadata, '{photo_url}', to_jsonb(${cover}::text))
           END
     WHERE id = ${row.id}
  `;
  for (const [i, day] of (days ?? []).entries()) {
    if (day.photo_url === row.days_json?.[i]?.photo_url) continue;
    const url = day.photo_url ?? null;
    const at = `{${i},photo_url}`;
    await sql`
      UPDATE trips
         SET days_json = CASE
           WHEN ${url}::text IS NULL THEN days_json #- ${at}::text[]
           ELSE jsonb_set(days_json, ${at}::text[], to_jsonb(${url}::text))
         END
       WHERE id = ${row.id}
    `;
  }
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  if (!env.databaseUrl) {
    logger.error('DATABASE_URL manquant — aucun trip à rafraîchir');
    process.exit(1);
  }
  const sql = postgres(env.databaseUrl, { max: 1 });
  const provider = createProviderFromEnv(process.env);
  setPhotoJudge(photoJudgeFromEnv());

  const rows = await sql<TripRow[]>`
    SELECT id, title, cover_photo, metadata, days_json, waypoints_json
      FROM trips
     ORDER BY created_at
  `;
  const refreshes: Refresh[] = [];
  for (const row of rows) {
    const keywords = row.metadata?.photo_keywords ?? [];
    // Une photo n'apparaît qu'une fois par trip : la couverture choisit d'abord
    const used = new Set<string>();
    const cover = await findTripCover(
      { waypoints: row.waypoints_json ?? [], days: row.days_json ?? [] },
      keywords,
      provider,
      used,
    );
    const days = row.days_json ? structuredClone(row.days_json) : null;
    if (days) await findDayPhotos(days, keywords, provider, used);
    const refresh = { row, cover, days };
    refreshes.push(refresh);
    logger.info(
      {
        trip: row.title,
        id: row.id,
        changed: hasChanged(refresh),
        cover: `${label(row.cover_photo)} → ${label(cover)}`,
        days: (days ?? []).map(
          (day, i) => `J${day.day} ${label(row.days_json?.[i]?.photo_url)} → ${label(day.photo_url)}`,
        ),
      },
      'Photos recalculées',
    );
  }

  const changed = refreshes.filter(hasChanged);
  if (!apply) {
    logger.info(
      { trips: refreshes.length, changed: changed.length },
      "Aperçu terminé, rien n'est écrit — relancer avec --apply pour enregistrer",
    );
    await sql.end();
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const rollbackFile = path.join(os.homedir(), `photos-rollback-${stamp}.sql`);
  writeFileSync(rollbackFile, `${changed.flatMap(rollbackOf).join('\n')}\n`);
  logger.info({ rollbackFile, trips: changed.length }, 'Anciennes photos sauvegardées');

  // Tout ou rien : une erreur en route n'enregistre aucun trip à moitié
  await sql.begin(async (tx) => {
    for (const refresh of changed) await applyRefresh(tx, refresh);
  });
  logger.info({ trips: changed.length, rollbackFile }, 'Photos des trips enregistrées');
  await sql.end();
}

main().catch((error) => {
  logger.error({ error }, 'Rafraîchissement des photos échoué');
  process.exit(1);
});
