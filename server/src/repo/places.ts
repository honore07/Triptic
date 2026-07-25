import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { PlaceKind, PlaceRegion, ShortlistPlace } from '@triptic/shared';
import { placeReviews, places } from '../db/schema.js';

/** Forme d'insertion d'un lieu (imports + ajouts). */
export interface PlaceInput {
  name: string;
  kind: PlaceKind;
  lat: number;
  lng: number;
  region: PlaceRegion | null;
  elevation_m?: number | null;
  tags?: string[];
  summary?: string | null;
  notoriety?: number;
  confidence?: number;
  status?: 'active' | 'pending' | 'rejected';
  source: string;
  source_id?: string | null;
  source_url?: string | null;
  wikidata_id?: string | null;
  wikipedia?: string | null;
}

/** WKT d'un point pour PostGIS (ordre lon lat — pas lat lng). */
export function toPointWkt(lat: number, lng: number): string {
  return `POINT(${lng} ${lat})`;
}

/** Nom normalisé pour le dédoublonnage inter-sources (minuscule, sans accents). */
export function normalizePlaceName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * WKT du couloir d'un trip : LINESTRING des waypoints (ou POINT si un seul).
 * Les points identiques consécutifs sont fusionnés.
 */
export function toCorridorWkt(points: { lat: number; lng: number }[]): string | null {
  const coords: string[] = [];
  for (const p of points) {
    const c = `${p.lng} ${p.lat}`;
    if (coords[coords.length - 1] !== c) coords.push(c);
  }
  if (coords.length === 0) return null;
  if (coords.length === 1) return `POINT(${coords[0]})`;
  return `LINESTRING(${coords.join(', ')})`;
}

/**
 * Répartition incontournables / pépites de la shortlist selon le curseur
 * "Exploration" du TripTuner (1 = classiques, 5 = hors des sentiers battus).
 */
export function splitShortlistLimits(
  limit: number,
  discovery: number = 3,
): { majors: number; gems: number } {
  const d = Math.min(5, Math.max(1, discovery));
  const gems = Math.round(limit * (0.1 + d * 0.1));
  return { majors: limit - gems, gems };
}

export interface ShortlistOptions {
  /** Rayon du couloir autour du tracé, en mètres (défaut 20 km). */
  radiusM?: number;
  /** Taille totale de la shortlist (défaut 60 — ~2 000 tokens). */
  limit?: number;
  /** Curseur Exploration 1-5 du TripTuner. */
  discovery?: number;
}

const BATCH_SIZE = 500;

/**
 * Repo PostgreSQL + PostGIS de la base de connaissance des lieux.
 * L'upsert est idempotent sur (source, source_id) : relancer un import
 * ne crée jamais de doublon, il rafraîchit les données.
 */
export class PgPlaceRepo {
  private readonly db: PostgresJsDatabase;

  constructor(databaseUrl: string) {
    const client = postgres(databaseUrl, { max: 10 });
    this.db = drizzle(client);
  }

  /** Insère/rafraîchit un lot de lieux. Retourne le nombre de lignes traitées. */
  async bulkUpsert(inputs: PlaceInput[]): Promise<number> {
    let count = 0;
    for (let i = 0; i < inputs.length; i += BATCH_SIZE) {
      const batch = inputs.slice(i, i + BATCH_SIZE);
      await this.db
        .insert(places)
        .values(
          batch.map((p) => ({
            name: p.name,
            kind: p.kind,
            location: sql`ST_GeogFromText(${toPointWkt(p.lat, p.lng)})`,
            region: p.region,
            elevation_m: p.elevation_m ?? null,
            tags: p.tags ?? [],
            summary: p.summary ?? null,
            notoriety: p.notoriety ?? 20,
            confidence: p.confidence ?? 50,
            status: p.status ?? 'active',
            source: p.source,
            source_id: p.source_id ?? null,
            source_url: p.source_url ?? null,
            wikidata_id: p.wikidata_id ?? null,
            wikipedia: p.wikipedia ?? null,
          })),
        )
        .onConflictDoUpdate({
          target: [places.source, places.source_id],
          targetWhere: sql`source_id IS NOT NULL`,
          set: {
            name: sql`excluded.name`,
            kind: sql`excluded.kind`,
            location: sql`excluded.location`,
            region: sql`excluded.region`,
            elevation_m: sql`excluded.elevation_m`,
            tags: sql`excluded.tags`,
            summary: sql`excluded.summary`,
            notoriety: sql`excluded.notoriety`,
            wikidata_id: sql`excluded.wikidata_id`,
            wikipedia: sql`excluded.wikipedia`,
            updated_at: sql`now()`,
          },
        });
      count += batch.length;
    }
    return count;
  }

  /**
   * Upsert avec dédoublonnage inter-sources : si un lieu d'une AUTRE source
   * porte le même nom normalisé à moins de 150 m, on fusionne (résumé si
   * manquant, notoriété max, wikidata si manquant) au lieu de créer un doublon.
   * Retourne {inserted, merged}.
   */
  async upsertWithDedup(inputs: PlaceInput[]): Promise<{ inserted: number; merged: number }> {
    let inserted = 0;
    let merged = 0;
    for (const p of inputs) {
      const wkt = toPointWkt(p.lat, p.lng);
      const existing = await this.db.execute(sql`
        SELECT id FROM places
        WHERE source <> ${p.source}
          AND lower(immutable_unaccent(name)) = lower(immutable_unaccent(${p.name}))
          AND ST_DWithin(location, ST_GeogFromText(${wkt}), 150)
        LIMIT 1
      `);
      const match = (existing as unknown as { id: string }[])[0];
      if (match) {
        await this.db.execute(sql`
          UPDATE places SET
            summary     = COALESCE(summary, ${p.summary ?? null}),
            notoriety   = GREATEST(notoriety, ${p.notoriety ?? 20}),
            wikidata_id = COALESCE(wikidata_id, ${p.wikidata_id ?? null}),
            updated_at  = now()
          WHERE id = ${match.id}
        `);
        merged += 1;
      } else {
        await this.bulkUpsert([p]);
        inserted += 1;
      }
    }
    return { inserted, merged };
  }

  /**
   * Shortlist des meilleurs lieux dans un couloir autour du tracé —
   * la requête qui remplace des milliers de tokens d'imagination IA.
   * Mix incontournables (notoriété ≥ 50, triés par notoriété) et pépites
   * (notoriété < 50, confiance ≥ 70, triées par proximité du tracé).
   */
  async shortlistForCorridor(
    points: { lat: number; lng: number }[],
    opts: ShortlistOptions = {},
  ): Promise<ShortlistPlace[]> {
    const wkt = toCorridorWkt(points);
    if (!wkt) return [];
    const radius = opts.radiusM ?? 20000;
    const { majors, gems } = splitShortlistLimits(opts.limit ?? 60, opts.discovery ?? 3);

    const majorRows = await this.db.execute(sql`
      SELECT name, kind, notoriety, summary,
             ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
      FROM places
      WHERE status = 'active' AND notoriety >= 50
        AND ST_DWithin(location, ST_GeogFromText(${wkt}), ${radius})
      ORDER BY notoriety DESC, ST_Distance(location, ST_GeogFromText(${wkt})) ASC
      LIMIT ${majors}
    `);
    const gemRows = await this.db.execute(sql`
      SELECT name, kind, notoriety, summary,
             ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
      FROM places
      WHERE status = 'active' AND notoriety < 50 AND confidence >= 70
        AND ST_DWithin(location, ST_GeogFromText(${wkt}), ${radius})
      ORDER BY ST_Distance(location, ST_GeogFromText(${wkt})) ASC
      LIMIT ${gems}
    `);

    return [...(majorRows as unknown as ShortlistPlace[]), ...(gemRows as unknown as ShortlistPlace[])];
  }

  /** Lieux liés à Wikidata — pour l'enrichissement du score de notoriété. */
  async listWikidataIds(): Promise<{ id: string; wikidata_id: string }[]> {
    const rows = await this.db.execute(sql`
      SELECT id, wikidata_id FROM places WHERE wikidata_id IS NOT NULL
    `);
    return rows as unknown as { id: string; wikidata_id: string }[];
  }

  /** Applique l'enrichissement Wikidata (notoriété recalculée, résumé si absent). */
  async applyEnrichment(id: string, notoriety: number, summary: string | null): Promise<void> {
    await this.db.execute(sql`
      UPDATE places SET
        notoriety  = ${notoriety},
        summary    = COALESCE(summary, ${summary}),
        updated_at = now()
      WHERE id = ${id}
    `);
  }

  /**
   * Ajout manuel d'un lieu par un utilisateur (phase E).
   * Entre en statut 'pending' (modération) avec confiance basse ; si le lieu
   * existe déjà dans la base (autre source, même nom à 150 m), on fusionne.
   */
  async submitUserPlace(input: {
    name: string;
    kind: PlaceKind;
    lat: number;
    lng: number;
    summary?: string | null;
    userId?: string | null;
  }): Promise<'pending' | 'merged'> {
    const { inserted } = await this.upsertWithDedup([
      {
        name: input.name,
        kind: input.kind,
        lat: input.lat,
        lng: input.lng,
        region: null,
        summary: input.summary ?? null,
        tags: [],
        notoriety: 20,
        confidence: 30,
        status: 'pending',
        source: 'user',
        source_id: randomUUID(),
      },
    ]);
    return inserted > 0 ? 'pending' : 'merged';
  }

  /**
   * Avis 1-5 sur un lieu — la note fait évoluer la confiance du lieu
   * (±3 points par avis autour de la neutralité 3). Retourne false si le
   * lieu n'existe pas.
   */
  async addReview(
    placeId: string,
    userId: string | null,
    rating: number,
    comment: string | null,
  ): Promise<boolean> {
    const found = await this.db.execute(
      sql`SELECT id FROM places WHERE id = ${placeId} LIMIT 1`,
    );
    if ((found as unknown as unknown[]).length === 0) return false;
    await this.db.insert(placeReviews).values({
      place_id: placeId,
      user_id: userId,
      rating,
      comment,
    });
    await this.db.execute(sql`
      UPDATE places SET
        confidence = LEAST(100, GREATEST(0, confidence + (${rating} - 3) * 3)),
        updated_at = now()
      WHERE id = ${placeId}
    `);
    return true;
  }

  /** Lieux actifs autour d'un point (affichage carte + aide à la contribution). */
  async findNearby(
    lat: number,
    lng: number,
    radiusM: number,
    limit: number,
  ): Promise<(ShortlistPlace & { id: string })[]> {
    const wkt = toPointWkt(lat, lng);
    const rows = await this.db.execute(sql`
      SELECT id, name, kind, notoriety, summary,
             ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
      FROM places
      WHERE status = 'active'
        AND ST_DWithin(location, ST_GeogFromText(${wkt}), ${radiusM})
      ORDER BY ST_Distance(location, ST_GeogFromText(${wkt})) ASC
      LIMIT ${limit}
    `);
    return rows as unknown as (ShortlistPlace & { id: string })[];
  }

  /** Comptages par région et par type — vérification post-import + couverture. */
  async stats(): Promise<{ region: string | null; kind: string; count: number }[]> {
    const rows = await this.db
      .select({
        region: places.region,
        kind: places.kind,
        count: sql<number>`count(*)::int`,
      })
      .from(places)
      .groupBy(places.region, places.kind);
    return rows;
  }
}
