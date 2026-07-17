import { randomUUID } from 'node:crypto';
import type { Trip } from '@triptic/shared';

export interface TripRepo {
  save(trip: Omit<Trip, 'id' | 'created_at' | 'updated_at'>): Promise<Trip>;
  listByUser(userId: string): Promise<Trip[]>;
  getById(id: string): Promise<Trip | null>;
  getBySlug(slug: string): Promise<Trip | null>;
  update(id: string, patch: Partial<Pick<Trip, 'title' | 'is_public' | 'status' | 'waypoints' | 'slug'>>): Promise<Trip | null>;
}

/**
 * Repo in-memory pour le développement local sans PostgreSQL.
 * En production VPS : PgTripRepo (Drizzle + PostGIS), voir db/schema.ts.
 */
export class MemoryTripRepo implements TripRepo {
  private readonly trips = new Map<string, Trip>();

  async save(input: Omit<Trip, 'id' | 'created_at' | 'updated_at'>): Promise<Trip> {
    const now = new Date().toISOString();
    const trip: Trip = { ...input, id: randomUUID(), created_at: now, updated_at: now };
    this.trips.set(trip.id, trip);
    return trip;
  }

  async listByUser(userId: string): Promise<Trip[]> {
    return [...this.trips.values()].filter((t) => t.user_id === userId);
  }

  async getById(id: string): Promise<Trip | null> {
    return this.trips.get(id) ?? null;
  }

  async getBySlug(slug: string): Promise<Trip | null> {
    return [...this.trips.values()].find((t) => t.slug === slug && t.is_public) ?? null;
  }

  async update(
    id: string,
    patch: Partial<Pick<Trip, 'title' | 'is_public' | 'status' | 'waypoints' | 'slug'>>,
  ): Promise<Trip | null> {
    const trip = this.trips.get(id);
    if (!trip) return null;
    const updated: Trip = { ...trip, ...patch, updated_at: new Date().toISOString() };
    this.trips.set(id, updated);
    return updated;
  }
}
