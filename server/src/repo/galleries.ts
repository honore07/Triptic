import { sql } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { placeGalleries } from '../db/schema.js';
import type { PlaceMedia } from '../services/photos.js';

/**
 * Galeries photo persistées (migration 0009).
 *
 * Le cache mémoire de photos.ts repartait de zéro à chaque redémarrage : la
 * galerie était refiltrée par l'agent photo alors que les photos d'un lieu ne
 * bougent pas. Ici elle est écrite une fois et relue ensuite.
 */
export interface GalleryStore {
  get(key: string): Promise<PlaceMedia[] | null>;
  set(key: string, query: string, media: PlaceMedia[]): Promise<void>;
  /** Lieux notoires sans galerie fraîche — alimente le pré-calcul nocturne. */
  staleTargets(limit: number, maxAgeDays: number): Promise<{ query: string; lat: number; lng: number }[]>;
}

export class PgGalleryStore implements GalleryStore {
  private readonly db: PostgresJsDatabase;

  constructor(databaseUrl: string) {
    this.db = drizzle(postgres(databaseUrl));
  }

  async get(key: string): Promise<PlaceMedia[] | null> {
    const rows = await this.db
      .select({ media: placeGalleries.media })
      .from(placeGalleries)
      .where(sql`${placeGalleries.cache_key} = ${key}`)
      .limit(1);
    const media = rows[0]?.media;
    return Array.isArray(media) ? (media as PlaceMedia[]) : null;
  }

  async set(key: string, query: string, media: PlaceMedia[]): Promise<void> {
    // Une galerie vide ne se stocke pas : ce serait figer un échec réseau.
    if (media.length === 0) return;
    await this.db.execute(sql`
      INSERT INTO place_galleries (cache_key, media, query, updated_at)
      VALUES (${key}, ${JSON.stringify(media)}::jsonb, ${query}, NOW())
      ON CONFLICT (cache_key) DO UPDATE
        SET media = EXCLUDED.media, updated_at = NOW()
    `);
  }

  /**
   * Les lieux les plus notoires qui n'ont pas encore de galerie (ou dont la
   * galerie a vieilli). Notoriété d'abord : ce sont ceux qu'on ouvre le plus.
   */
  async staleTargets(
    limit: number,
    maxAgeDays: number,
  ): Promise<{ query: string; lat: number; lng: number }[]> {
    const rows = await this.db.execute<{ name: string; lat: number; lng: number }>(sql`
      SELECT p.name,
             ST_Y(p.location::geometry) AS lat,
             ST_X(p.location::geometry) AS lng
        FROM places p
        LEFT JOIN place_galleries g ON g.query = p.name
       WHERE p.status = 'active'
         AND p.location IS NOT NULL
         AND (g.cache_key IS NULL OR g.updated_at < NOW() - ${`${maxAgeDays} days`}::interval)
       ORDER BY p.notoriety DESC NULLS LAST
       LIMIT ${limit}
    `);
    return [...rows].map((r) => ({ query: r.name, lat: Number(r.lat), lng: Number(r.lng) }));
  }
}
