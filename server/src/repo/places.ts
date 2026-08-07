import { randomUUID } from 'node:crypto';
import { sql, type SQL } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { FOOD_KINDS, type PlaceKind, type PlaceRegion, type ShortlistPlace } from '@triptic/shared';
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
  /** Tracé complet [lng, lat][] (tours DATAtourisme, rando phase 5). */
  trace?: [number, number][] | null;
  /** Provenance TDM (phase 6) — obligatoire pour source='web'. */
  opt_out_status?: string | null;
  fetch_date?: Date | null;
}

/** WKT d'un point pour PostGIS (ordre lon lat — pas lat lng). */
export function toPointWkt(lat: number, lng: number): string {
  return `POINT(${lng} ${lat})`;
}

/** WKT d'un tracé [lng, lat][] pour PostGIS. null si moins de 2 points. */
export function toTraceWkt(coords: [number, number][] | null | undefined): string | null {
  if (!coords || coords.length < 2) return null;
  return `LINESTRING(${coords.map(([lng, lat]) => `${lng} ${lat}`).join(', ')})`;
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
            opt_out_status: p.opt_out_status ?? null,
            fetch_date: p.fetch_date ?? null,
            ...(toTraceWkt(p.trace)
              ? { trace: sql`ST_GeogFromText(${toTraceWkt(p.trace)})` }
              : {}),
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
            // Une trace connue n'est jamais écrasée par un import sans trace
            trace: sql`COALESCE(excluded.trace, places.trace)`,
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
        const traceWkt = toTraceWkt(p.trace);
        await this.db.execute(sql`
          UPDATE places SET
            summary     = COALESCE(summary, ${p.summary ?? null}),
            notoriety   = GREATEST(notoriety, ${p.notoriety ?? 20}),
            wikidata_id = COALESCE(wikidata_id, ${p.wikidata_id ?? null}),
            trace       = COALESCE(trace, ${traceWkt ? sql`ST_GeogFromText(${traceWkt})` : null}),
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

    // Les food (restos, cafés…) sont exclus du grounding : nombreux et proches
    // de tout, ils noieraient les vraies pépites. Ils restent interrogeables
    // via findNearby/bbox (« search this area », phase 4).
    const majorRows = await this.db.execute(sql`
      SELECT name, kind, notoriety, summary,
             ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
      FROM places
      WHERE status = 'active' AND notoriety >= 50
        AND kind <> ALL(${FOOD_KINDS as string[]})
        AND ST_DWithin(location, ST_GeogFromText(${wkt}), ${radius})
      ORDER BY notoriety DESC, ST_Distance(location, ST_GeogFromText(${wkt})) ASC
      LIMIT ${majors}
    `);
    const gemRows = await this.db.execute(sql`
      SELECT name, kind, notoriety, summary,
             ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
      FROM places
      WHERE status = 'active' AND notoriety < 50 AND confidence >= 70
        AND kind <> ALL(${FOOD_KINDS as string[]})
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

  /**
   * Lieux actifs dans la zone visible de la carte (« search this area », 4.1).
   * Tri par notoriété — le temps de trajet est calculé par la route au-dessus.
   */
  // (filtre de kinds : voir kindFilterSql en bas de fichier)
  async findInBbox(
    bbox: { south: number; west: number; north: number; east: number },
    kinds: PlaceKind[] | undefined,
    limit: number,
  ): Promise<(ShortlistPlace & { id: string })[]> {
    const kindFilter = kindFilterSql(kinds);
    const rows = await this.db.execute(sql`
      SELECT id, name, kind, notoriety, summary,
             ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
      FROM places
      WHERE status = 'active'
        ${kindFilter}
        AND ST_Intersects(
          location,
          ST_MakeEnvelope(${bbox.west}, ${bbox.south}, ${bbox.east}, ${bbox.north}, 4326)::geography
        )
      ORDER BY notoriety DESC
      LIMIT ${limit}
    `);
    return rows as unknown as (ShortlistPlace & { id: string })[];
  }

  /**
   * Boucles rando mappées proches d'un point (roadmap 5.2) : traces réelles
   * (Geotrek/OSM/DATAtourisme), longueur PostGIS, classées par proximité de
   * la distance cible puis notoriété. targetKm null = toutes longueurs.
   */
  async findTrailsNear(
    lat: number,
    lng: number,
    radiusM: number,
    targetKm: number | null,
    limit: number,
  ): Promise<
    {
      id: string;
      name: string;
      summary: string | null;
      notoriety: number;
      source: string;
      distance_km: number;
      geometry: [number, number][];
    }[]
  > {
    const wkt = toPointWkt(lat, lng);
    const rows = await this.db.execute(sql`
      SELECT id, name, summary, notoriety, source,
             ROUND((ST_Length(trace) / 1000)::numeric, 1)::float AS distance_km,
             ST_AsGeoJSON(trace::geometry) AS geojson
      FROM places
      WHERE status = 'active' AND kind = 'trail' AND trace IS NOT NULL
        AND ST_DWithin(trace, ST_GeogFromText(${wkt}), ${radiusM})
      ORDER BY
        ${targetKm !== null ? sql`ABS(ST_Length(trace) / 1000 - ${targetKm}) ASC,` : sql``}
        notoriety DESC
      LIMIT ${limit}
    `);
    return (rows as unknown as (Record<string, unknown> & { geojson: string })[]).map(
      ({ geojson, ...rest }) => ({
        ...(rest as {
          id: string;
          name: string;
          summary: string | null;
          notoriety: number;
          source: string;
          distance_km: number;
        }),
        geometry: (JSON.parse(geojson) as { coordinates: [number, number][] }).coordinates,
      }),
    );
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

  /** Résumé de santé de la base — monitoring (n8n, rapport hebdo). */
  async statsSummary(): Promise<{
    total: number;
    pending: number;
    by_region: { region: string | null; count: number }[];
    by_source: { source: string; count: number }[];
    /** Conformité TDM (phase 6) — rapport hebdo de l'agent 5. */
    tdm: {
      web_active: number;
      web_pending: number;
      sources_total: number;
      sources_opted_out: number;
    };
  }> {
    const totals = await this.db.execute(sql`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE status = 'pending')::int AS pending
      FROM places
    `);
    const byRegion = await this.db.execute(sql`
      SELECT region, count(*)::int AS count FROM places GROUP BY region ORDER BY count DESC
    `);
    const bySource = await this.db.execute(sql`
      SELECT source, count(*)::int AS count FROM places GROUP BY source ORDER BY count DESC
    `);
    const t = (totals as unknown as { total: number; pending: number }[])[0];

    // Conformité TDM — tables/colonnes phase 6 : tolérant si la migration
    // 0005 n'est pas encore passée (rapport à zéro plutôt qu'erreur).
    let tdm = { web_active: 0, web_pending: 0, sources_total: 0, sources_opted_out: 0 };
    try {
      const webRows = await this.db.execute(sql`
        SELECT count(*) FILTER (WHERE status = 'active')::int AS web_active,
               count(*) FILTER (WHERE status = 'pending')::int AS web_pending
        FROM places WHERE source = 'web'
      `);
      const sourceRows = await this.db.execute(sql`
        SELECT count(*)::int AS sources_total,
               count(*) FILTER (WHERE opt_out_status = 'opted_out')::int AS sources_opted_out
        FROM tdm_sources
      `);
      const web = (webRows as unknown as { web_active: number; web_pending: number }[])[0];
      const src = (sourceRows as unknown as {
        sources_total: number;
        sources_opted_out: number;
      }[])[0];
      tdm = {
        web_active: web?.web_active ?? 0,
        web_pending: web?.web_pending ?? 0,
        sources_total: src?.sources_total ?? 0,
        sources_opted_out: src?.sources_opted_out ?? 0,
      };
    } catch {
      // migration 0005 absente : rapport TDM vide
    }

    return {
      total: t?.total ?? 0,
      pending: t?.pending ?? 0,
      by_region: byRegion as unknown as { region: string | null; count: number }[],
      by_source: bySource as unknown as { source: string; count: number }[],
      tdm,
    };
  }
}

/**
 * Filtre SQL sur les types de lieux (« Nature », « Culture & villages »… de
 * la page Explore). Exporté pour être testable sans base.
 *
 * ⚠️ NE JAMAIS écrire `ANY(${kinds})` : Drizzle développe un tableau JS en
 * liste de paramètres — `ANY($1, $2, $3)` — que Postgres rejette avec
 * « op ANY/ALL (array) requires array on right side » (SQLSTATE 42809).
 * Tous les filtres Explore tombaient ainsi en 500, en local ET en prod.
 * `IN (...)` prend une liste de paramètres : c'est la forme correcte ici.
 */
export function kindFilterSql(kinds: PlaceKind[] | undefined): SQL {
  if (!kinds || kinds.length === 0) return sql``;
  return sql`AND kind IN (${sql.join(
    kinds.map((kind) => sql`${kind}`),
    sql`, `,
  )})`;
}
