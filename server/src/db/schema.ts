import { sql } from 'drizzle-orm';
import {
  boolean,
  customType,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Tracé GPS en GEOGRAPHY PostGIS — SRID 4326 (WGS84), calculs en mètres.
 * Toute requête géospatiale passe par PostGIS (règle qualité #7).
 */
const geographyLineString = customType<{ data: string }>({
  dataType() {
    return 'geography(LineString,4326)';
  },
});

const geographyPoint = customType<{ data: string }>({
  dataType() {
    return 'geography(Point,4326)';
  },
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  email: text('email').unique().notNull(),
  name: text('name'),
  plan: text('plan').default('free').notNull(), // free | aventurier | explorateur
  lang: text('lang').default('fr').notNull(), // fr | en | de
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const trips = pgTable('trips', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  user_id: uuid('user_id').references(() => users.id),
  title: text('title').notNull(),
  slug: text('slug').unique(),
  is_public: boolean('is_public').default(false).notNull(),
  mode: text('mode'), // roadtrip | trek | bikepacking | multi
  status: text('status').default('draft').notNull(), // draft | saved | shared
  metadata: jsonb('metadata'),
  waypoints: geographyLineString('waypoints'),
  waypoints_json: jsonb('waypoints_json'), // détail app (noms, jours, types)
  gpx_url: text('gpx_url'),
  cover_photo: text('cover_photo'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const aiSessions = pgTable('ai_sessions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  user_id: uuid('user_id').references(() => users.id),
  messages: jsonb('messages').notNull().default(sql`'[]'::jsonb`),
  context: jsonb('context'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const tripFeedbacks = pgTable('trip_feedbacks', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  trip_id: uuid('trip_id').references(() => trips.id),
  user_id: uuid('user_id').references(() => users.id),
  rating: integer('rating'),
  issues: text('issues').array(),
  comment: text('comment'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

/**
 * Base de connaissance des lieux (POI réels multi-sources).
 * notoriety 0-100 (incontournable vs pépite), confidence 0-100 (fiabilité),
 * status : active | pending (à modérer) | rejected.
 * Unicité par (source, source_id) → imports idempotents.
 */
export const places = pgTable('places', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: text('name').notNull(),
  kind: text('kind').notNull(), // PlaceKind (@triptic/shared)
  location: geographyPoint('location').notNull(),
  region: text('region'), // alsace-vosges | alpes-fr | alpes-ch | alpes-it
  elevation_m: integer('elevation_m'),
  tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
  summary: text('summary'),
  notoriety: integer('notoriety').notNull().default(20),
  confidence: integer('confidence').notNull().default(50),
  status: text('status').notNull().default('active'),
  source: text('source').notNull(), // osm | datatourisme | web | user
  source_id: text('source_id'),
  source_url: text('source_url'),
  wikidata_id: text('wikidata_id'),
  wikipedia: text('wikipedia'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

/** Avis utilisateurs sur les lieux — fait évoluer la confiance des lieux. */
export const placeReviews = pgTable('place_reviews', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  place_id: uuid('place_id')
    .references(() => places.id, { onDelete: 'cascade' })
    .notNull(),
  user_id: uuid('user_id').references(() => users.id),
  rating: integer('rating').notNull(),
  comment: text('comment'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const vanSpots = pgTable('van_spots', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: text('name').notNull(),
  category: text('category'), // camping | parking | wild | service
  source: text('source'), // ioverlander | park4night
  location: geographyPoint('location'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
