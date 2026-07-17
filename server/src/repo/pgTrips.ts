import { and, desc, eq, isNull, sql, type SQL } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { Trip, TripMode, Waypoint } from '@triptic/shared';
import { trips } from '../db/schema.js';
import type { TripRepo, TripPatch } from './trips.js';

/**
 * Avant l'auth Supabase, req.user.id vaut 'anonymous' (voir middleware/auth.ts) :
 * la colonne uuid user_id stocke NULL dans ce cas, et NULL se relit 'anonymous'
 * pour que le contrôle de propriété des routes reste identique au MemoryTripRepo.
 * Quand Supabase sera branché, le sub JWT (uuid) devra exister dans users
 * (provisionner la ligne au premier login) pour satisfaire la FK.
 */
const ANONYMOUS_USER_ID = 'anonymous';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Colonnes relues par l'app — jamais la GEOGRAPHY brute (waypoints_json fait foi côté app). */
const tripColumns = {
  id: trips.id,
  user_id: trips.user_id,
  title: trips.title,
  slug: trips.slug,
  is_public: trips.is_public,
  mode: trips.mode,
  status: trips.status,
  metadata: trips.metadata,
  waypoints_json: trips.waypoints_json,
  cover_photo: trips.cover_photo,
  created_at: trips.created_at,
  updated_at: trips.updated_at,
};

type TripRow = {
  id: string;
  user_id: string | null;
  title: string;
  slug: string | null;
  is_public: boolean;
  mode: string | null;
  status: string;
  metadata: unknown;
  waypoints_json: unknown;
  cover_photo: string | null;
  created_at: Date | null;
  updated_at: Date | null;
};

/** WKT du tracé pour PostGIS (ordre lon lat — pas lat lng). */
export function toLineStringWkt(waypoints: Waypoint[]): string | null {
  if (waypoints.length < 2) return null;
  const coords = waypoints.map((w) => `${w.lng} ${w.lat}`).join(', ');
  return `LINESTRING(${coords})`;
}

export function normalizeUserId(userId: string | null): string | null {
  return userId !== null && UUID_RE.test(userId) ? userId : null;
}

export function rowToTrip(row: TripRow): Trip {
  return {
    id: row.id,
    user_id: row.user_id ?? ANONYMOUS_USER_ID,
    title: row.title,
    slug: row.slug,
    is_public: row.is_public,
    mode: (row.mode ?? 'roadtrip') as TripMode,
    status: row.status as Trip['status'],
    metadata: row.metadata as Trip['metadata'],
    waypoints: (row.waypoints_json ?? []) as Waypoint[],
    cover_photo: row.cover_photo,
    created_at: (row.created_at ?? new Date()).toISOString(),
    updated_at: (row.updated_at ?? new Date()).toISOString(),
  };
}

/**
 * Repo PostgreSQL + PostGIS (production VPS).
 * Le tracé est stocké deux fois : waypoints_json (détail app : noms, jours,
 * types) et waypoints GEOGRAPHY(LineString,4326) construit par PostGIS pour
 * les requêtes géospatiales (spots à proximité, longueur réelle…).
 */
export class PgTripRepo implements TripRepo {
  private readonly db: PostgresJsDatabase;

  constructor(databaseUrl: string) {
    // Connexion lazy (ouverte à la première requête), pool modeste : 1 seul
    // process PM2 en fork.
    const client = postgres(databaseUrl, { max: 10 });
    this.db = drizzle(client);
  }

  async save(input: Omit<Trip, 'id' | 'created_at' | 'updated_at'>): Promise<Trip> {
    const wkt = toLineStringWkt(input.waypoints);
    const [row] = await this.db
      .insert(trips)
      .values({
        user_id: normalizeUserId(input.user_id),
        title: input.title,
        slug: input.slug,
        is_public: input.is_public,
        mode: input.mode,
        status: input.status,
        metadata: input.metadata,
        waypoints_json: input.waypoints,
        ...(wkt ? { waypoints: sql`ST_GeogFromText(${wkt})` } : {}),
        cover_photo: input.cover_photo,
      })
      .returning(tripColumns);
    if (!row) throw new Error('insert_returned_no_row');
    return rowToTrip(row);
  }

  async listByUser(userId: string): Promise<Trip[]> {
    const rows = await this.db
      .select(tripColumns)
      .from(trips)
      .where(this.userFilter(userId))
      .orderBy(desc(trips.created_at));
    return rows.map(rowToTrip);
  }

  async getById(id: string): Promise<Trip | null> {
    if (!UUID_RE.test(id)) return null; // évite l'erreur pg 22P02 sur uuid invalide
    const [row] = await this.db.select(tripColumns).from(trips).where(eq(trips.id, id));
    return row ? rowToTrip(row) : null;
  }

  async getBySlug(slug: string): Promise<Trip | null> {
    const [row] = await this.db
      .select(tripColumns)
      .from(trips)
      .where(and(eq(trips.slug, slug), eq(trips.is_public, true)));
    return row ? rowToTrip(row) : null;
  }

  async update(id: string, patch: TripPatch): Promise<Trip | null> {
    if (!UUID_RE.test(id)) return null;
    const set: Record<string, unknown> = { updated_at: new Date() };
    if (patch.title !== undefined) set['title'] = patch.title;
    if (patch.slug !== undefined) set['slug'] = patch.slug;
    if (patch.is_public !== undefined) set['is_public'] = patch.is_public;
    if (patch.status !== undefined) set['status'] = patch.status;
    if (patch.mode !== undefined) set['mode'] = patch.mode;
    if (patch.metadata !== undefined) set['metadata'] = patch.metadata;
    if (patch.cover_photo !== undefined) set['cover_photo'] = patch.cover_photo;
    if (patch.waypoints !== undefined) {
      set['waypoints_json'] = patch.waypoints;
      const wkt = toLineStringWkt(patch.waypoints);
      set['waypoints'] = wkt ? sql`ST_GeogFromText(${wkt})` : null;
    }
    const [row] = await this.db
      .update(trips)
      .set(set)
      .where(eq(trips.id, id))
      .returning(tripColumns);
    return row ? rowToTrip(row) : null;
  }

  private userFilter(userId: string): SQL {
    const normalized = normalizeUserId(userId);
    return normalized ? eq(trips.user_id, normalized) : isNull(trips.user_id);
  }
}
