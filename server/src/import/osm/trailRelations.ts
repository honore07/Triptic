import type { PlaceInput } from '../../repo/places.js';
import { regionForPoint, type Bbox } from './regions.js';

/**
 * Relations OSM route=hiking/foot/walking → lieux kind 'trail' (roadmap 5.1).
 * Socle de couverture, sous ODbL.
 *
 * ⛔ Garde-fou FFRandonnée : les GR®/GRP®/PR® (noms, sélection d'itinéraires,
 * balisage rouge-blanc / jaune-rouge) sont la propriété de la FFRP — on ne
 * les importe PAS. Le filtre ci-dessous écarte noms/refs GR* et les
 * osmc:symbol red:white / yellow:red caractéristiques.
 */

/** Élément relation renvoyé par `out geom` (membres avec géométrie). */
export interface OverpassRelation {
  type: string;
  id: number;
  tags?: Record<string, string>;
  members?: { type: string; role?: string; geometry?: { lat: number; lon: number }[] }[];
}

export function buildTrailQuery(bbox: Bbox): string {
  const bboxStr = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
  return `[out:json][timeout:300];\nrelation["route"~"^(hiking|foot|walking)$"][name](${bboxStr});\nout geom;`;
}

/** true si la relation relève du balisage/naming FFRP (à exclure).
 * Symboles visés : barres rouge-blanc des GR® (red:white:red_bar) et
 * jaune-rouge des GRP® — PAS les autres balisages red:white:* (Club Vosgien…). */
export function isFfrpProtected(tags: Record<string, string>): boolean {
  const name = `${tags['name'] ?? ''} ${tags['ref'] ?? ''}`;
  if (/\bGRP?\s?\d|\bGR\b|\bGRP\b|sentier de grande randonnée/i.test(name)) return true;
  const symbol = tags['osmc:symbol'] ?? '';
  return /^red:white:red_bar|^yellow:red:/.test(symbol);
}

/** Concatène les géométries des membres dans l'ordre (approximation v1 :
 * suffisant pour l'affichage et la longueur ; l'ordre des membres OSM est
 * généralement séquentiel sur les boucles locales). */
export function relationCoordinates(relation: OverpassRelation): [number, number][] {
  const coords: [number, number][] = [];
  for (const member of relation.members ?? []) {
    if (member.type !== 'way' || !member.geometry) continue;
    for (const point of member.geometry) {
      const last = coords[coords.length - 1];
      if (!last || last[0] !== point.lon || last[1] !== point.lat) {
        coords.push([point.lon, point.lat]);
      }
    }
  }
  return coords;
}

export function trailRelationToPlace(relation: OverpassRelation): PlaceInput | null {
  const tags = relation.tags ?? {};
  const name = tags['name'];
  if (!name || isFfrpProtected(tags)) return null;
  const coords = relationCoordinates(relation);
  if (coords.length < 2) return null;
  const [lng, lat] = coords[0]!;
  const region = regionForPoint(lat, lng);
  if (!region) return null;

  const distanceTag = Number.parseFloat(tags['distance'] ?? '');
  const facts = Number.isFinite(distanceTag) ? `${Math.round(distanceTag * 10) / 10} km` : null;
  const description = tags['description:fr'] ?? tags['description'] ?? null;
  const summary =
    [facts, description].filter(Boolean).join(' — ').slice(0, 200) || null;

  return {
    name,
    kind: 'trail',
    lat,
    lng,
    region,
    tags: ['rando'],
    summary,
    notoriety: tags['wikidata'] ? 45 : 30,
    confidence: 80,
    status: 'active',
    source: 'osm',
    source_id: `relation/${relation.id}`,
    source_url: `https://www.openstreetmap.org/relation/${relation.id}`,
    wikidata_id: tags['wikidata'] ?? null,
    trace: coords,
  };
}
