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

export const vanSpots = pgTable('van_spots', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: text('name').notNull(),
  category: text('category'), // camping | parking | wild | service
  source: text('source'), // ioverlander | park4night
  location: geographyPoint('location'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
