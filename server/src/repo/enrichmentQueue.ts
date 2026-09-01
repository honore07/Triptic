import { sql } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { Bbox } from '../import/osm/regions.js';

/**
 * File d'enrichissement persistée (migration 0010).
 *
 * Le traitement reste immédiat ; la table sert de mémoire pour ce qui n'a pas
 * abouti — process redémarré, Overpass en panne. Sans elle, une zone perdue
 * l'était définitivement et en silence.
 */
export interface EnrichmentQueueStore {
  /** Enregistre une zone à traiter. Ignore les doublons (même zone déjà vue). */
  enqueue(zoneKey: string, bbox: Bbox): Promise<void>;
  markDone(zoneKey: string, placesAdded: number): Promise<void>;
  markFailed(zoneKey: string, error: string): Promise<void>;
  /** Zones restées en attente, les plus anciennes d'abord. */
  pending(limit: number): Promise<{ zoneKey: string; bbox: Bbox }[]>;
}

export class PgEnrichmentQueueStore implements EnrichmentQueueStore {
  private readonly db: PostgresJsDatabase;

  constructor(databaseUrl: string) {
    this.db = drizzle(postgres(databaseUrl));
  }

  async enqueue(zoneKey: string, bbox: Bbox): Promise<void> {
    await this.db.execute(sql`
      INSERT INTO enrichment_queue (zone_key, south, west, north, east)
      VALUES (${zoneKey}, ${bbox.south}, ${bbox.west}, ${bbox.north}, ${bbox.east})
      ON CONFLICT (zone_key) DO NOTHING
    `);
  }

  async markDone(zoneKey: string, placesAdded: number): Promise<void> {
    await this.db.execute(sql`
      UPDATE enrichment_queue
         SET status = 'done', places_added = ${placesAdded},
             processed_at = NOW(), attempts = attempts + 1
       WHERE zone_key = ${zoneKey}
    `);
  }

  async markFailed(zoneKey: string, error: string): Promise<void> {
    await this.db.execute(sql`
      UPDATE enrichment_queue
         SET status = 'failed', last_error = ${error.slice(0, 500)},
             processed_at = NOW(), attempts = attempts + 1
       WHERE zone_key = ${zoneKey}
    `);
  }

  async pending(limit: number): Promise<{ zoneKey: string; bbox: Bbox }[]> {
    // 'failed' est repris aussi : une panne Overpass est presque toujours
    // passagère. attempts borne les tentatives pour ne pas boucler à l'infini.
    const rows = await this.db.execute<{
      zone_key: string;
      south: number;
      west: number;
      north: number;
      east: number;
    }>(sql`
      SELECT zone_key, south, west, north, east
        FROM enrichment_queue
       WHERE status IN ('pending', 'failed')
         AND attempts < 3
       ORDER BY created_at
       LIMIT ${limit}
    `);
    return [...rows].map((r) => ({
      zoneKey: r.zone_key,
      bbox: {
        south: Number(r.south),
        west: Number(r.west),
        north: Number(r.north),
        east: Number(r.east),
      },
    }));
  }
}
