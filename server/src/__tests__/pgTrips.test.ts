import { describe, expect, it } from 'vitest';
import type { Waypoint } from '@triptic/shared';
import { normalizeUserId, rowToTrip, toLineStringWkt } from '../repo/pgTrips.js';

const WAYPOINTS: Waypoint[] = [
  { name: 'Col de la Schlucht', lat: 48.0631, lng: 7.0209, day: 1, kind: 'start' },
  { name: 'Le Hohneck', lat: 48.0403, lng: 7.0086, day: 1, kind: 'poi' },
  { name: 'Grand Ballon', lat: 47.9014, lng: 7.0994, day: 3, kind: 'end' },
];

describe('toLineStringWkt', () => {
  it('builds a WKT LINESTRING in lon lat order (PostGIS)', () => {
    expect(toLineStringWkt(WAYPOINTS)).toBe(
      'LINESTRING(7.0209 48.0631, 7.0086 48.0403, 7.0994 47.9014)',
    );
  });

  it('returns null under 2 waypoints (LINESTRING invalide sinon)', () => {
    expect(toLineStringWkt([])).toBeNull();
    expect(toLineStringWkt(WAYPOINTS.slice(0, 1))).toBeNull();
  });
});

describe('normalizeUserId', () => {
  it('keeps a valid uuid (futur sub Supabase)', () => {
    const uuid = '6f9619ff-8b86-4d01-b42d-00cf4fc964ff';
    expect(normalizeUserId(uuid)).toBe(uuid);
  });

  it("maps 'anonymous' and null to NULL (colonne uuid)", () => {
    expect(normalizeUserId('anonymous')).toBeNull();
    expect(normalizeUserId(null)).toBeNull();
  });
});

describe('rowToTrip', () => {
  const row = {
    id: '6f9619ff-8b86-4d01-b42d-00cf4fc964ff',
    user_id: null,
    title: 'Crêtes des Vosges',
    slug: null,
    is_public: false,
    mode: 'trek',
    status: 'saved',
    metadata: { duration_days: 3 },
    waypoints_json: WAYPOINTS,
    cover_photo: null,
    created_at: new Date('2026-07-17T10:00:00Z'),
    updated_at: new Date('2026-07-17T10:00:00Z'),
  };

  it('maps a row to the app Trip shape (dates ISO, waypoints from JSONB)', () => {
    const trip = rowToTrip(row);
    expect(trip.created_at).toBe('2026-07-17T10:00:00.000Z');
    expect(trip.waypoints).toEqual(WAYPOINTS);
    expect(trip.status).toBe('saved');
  });

  it("relit user_id NULL comme 'anonymous' (contrôle de propriété des routes)", () => {
    expect(rowToTrip(row).user_id).toBe('anonymous');
    expect(
      rowToTrip({ ...row, user_id: '6f9619ff-8b86-4d01-b42d-00cf4fc964ff' }).user_id,
    ).toBe('6f9619ff-8b86-4d01-b42d-00cf4fc964ff');
  });
});
