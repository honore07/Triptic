import { sql } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { OptOutStatus } from '../services/blogMining.js';
import { toPointWkt } from './places.js';

/**
 * Registre des sources TDM + recoupement des faits (roadmap 6) :
 * statut d'opt-out par source (re-vérifié à chaque passage), liste
 * d'exclusion, plafond anti-mirroring, et vérification qu'un fait est
 * confirmé par une source indépendante (OSM/DATAtourisme/Wikidata/Geotrek).
 */

export interface TdmSource {
  origin: string;
  opt_out_status: OptOutStatus;
  excluded: boolean;
  extracted_count: number;
}

export class PgTdmRepo {
  private readonly db: PostgresJsDatabase;

  constructor(databaseUrl: string) {
    const client = postgres(databaseUrl, { max: 5 });
    this.db = drizzle(client);
  }

  async getSource(origin: string): Promise<TdmSource | null> {
    const rows = await this.db.execute(sql`
      SELECT origin, opt_out_status, excluded, extracted_count
      FROM tdm_sources WHERE origin = ${origin} LIMIT 1
    `);
    return (rows as unknown as TdmSource[])[0] ?? null;
  }

  /** Enregistre/rafraîchit le statut d'opt-out d'une source (à chaque fetch). */
  async recordCheck(origin: string, status: OptOutStatus, detail: string | null): Promise<void> {
    await this.db.execute(sql`
      INSERT INTO tdm_sources (origin, opt_out_status, opt_out_detail, last_checked_at)
      VALUES (${origin}, ${status}, ${detail}, now())
      ON CONFLICT (origin) DO UPDATE SET
        opt_out_status = ${status},
        opt_out_detail = ${detail},
        last_checked_at = now()
    `);
  }

  async bumpExtracted(origin: string, count: number): Promise<void> {
    await this.db.execute(sql`
      UPDATE tdm_sources SET extracted_count = extracted_count + ${count}
      WHERE origin = ${origin}
    `);
  }

  /**
   * Recoupement : le fait est-il confirmé par une source indépendante du web
   * (même nom normalisé à moins de 300 m) ? Un fait confirmé par OSM devient
   * indépendant du blog (droit des bases : faits non protégés).
   */
  async crossCheck(name: string, lat: number, lng: number): Promise<boolean> {
    const wkt = toPointWkt(lat, lng);
    const rows = await this.db.execute(sql`
      SELECT 1 FROM places
      WHERE source <> 'web'
        AND lower(immutable_unaccent(name)) = lower(immutable_unaccent(${name}))
        AND ST_DWithin(location, ST_GeogFromText(${wkt}), 300)
      LIMIT 1
    `);
    return (rows as unknown as unknown[]).length > 0;
  }

  /** Sources refusées / taux pour le rapport hebdo de conformité. */
  async report(): Promise<{
    total: number;
    opted_out: number;
    excluded: number;
  }> {
    const rows = await this.db.execute(sql`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE opt_out_status = 'opted_out')::int AS opted_out,
             count(*) FILTER (WHERE excluded)::int AS excluded
      FROM tdm_sources
    `);
    const r = (rows as unknown as { total: number; opted_out: number; excluded: number }[])[0];
    return r ?? { total: 0, opted_out: 0, excluded: 0 };
  }
}
