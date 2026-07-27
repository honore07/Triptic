import type { PlaceInput } from '../../repo/places.js';
import { regionForPoint } from '../osm/regions.js';
import type { GeotrekPortal } from './portals.js';

/**
 * Mappe un trek Geotrek APIv2 → lieu TRIPTIC kind 'trail' avec trace (5.1).
 * Retourne null si inexploitable ou hors périmètre pilote.
 */

/** Champ multilingue Geotrek : {"fr": "…", "en": "…"} ou string. */
function pickGeotrekLang(value: unknown, lang = 'fr'): string | null {
  if (typeof value === 'string') return value || null;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const picked = obj[lang] ?? Object.values(obj).find((v) => typeof v === 'string' && v);
    return typeof picked === 'string' && picked ? picked : null;
  }
  return null;
}

export interface GeotrekTrek {
  id: number;
  name: unknown;
  description_teaser?: unknown;
  length_2d?: number;
  ascent?: number;
  duration?: number | null;
  geometry?: { type: string; coordinates: unknown } | null;
}

/** Coordonnées [lng, lat] d'une géométrie LineString/MultiLineString (3D tolérée). */
export function trekCoordinates(geometry: GeotrekTrek['geometry']): [number, number][] {
  if (!geometry) return [];
  const raw =
    geometry.type === 'LineString'
      ? (geometry.coordinates as number[][])
      : geometry.type === 'MultiLineString'
        ? (geometry.coordinates as number[][][]).flat()
        : [];
  return raw
    .filter((c): c is number[] => Array.isArray(c) && c.length >= 2)
    .map((c) => [c[0]!, c[1]!] as [number, number]);
}

export function trekToPlace(trek: GeotrekTrek, portal: GeotrekPortal): PlaceInput | null {
  const name = pickGeotrekLang(trek.name);
  const coords = trekCoordinates(trek.geometry ?? null);
  if (!name || coords.length < 2) return null;
  const [lng, lat] = coords[0]!;
  const region = regionForPoint(lat, lng);
  if (!region) return null;

  const km = trek.length_2d ? Math.round(trek.length_2d / 100) / 10 : null;
  const ascent = trek.ascent ?? null;
  const teaser = pickGeotrekLang(trek.description_teaser);
  const facts = [km !== null ? `${km} km` : null, ascent !== null ? `${ascent} m D+` : null]
    .filter(Boolean)
    .join(' · ');
  const summary = [facts, teaser].filter(Boolean).join(' — ').slice(0, 200) || null;

  return {
    name,
    kind: 'trail',
    lat,
    lng,
    region,
    tags: ['rando'],
    summary,
    // Boucles éditorialisées par les parcs : pertinence élevée par défaut
    notoriety: 50,
    confidence: 85,
    status: 'active',
    source: `geotrek-${portal.id}`,
    source_id: String(trek.id),
    source_url: `${portal.baseUrl}/api/v2/trek/${trek.id}/`,
    trace: coords,
  };
}
