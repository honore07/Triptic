import type { PlaceRegion } from '@triptic/shared';
import type { PlaceInput } from '../../repo/places.js';
import type { OsmCategory } from './categories.js';
import type { OverpassElement } from './overpassClient.js';

/** Les données OSM sont fiables mais pas parfaites (coordonnées exactes, noms). */
const OSM_CONFIDENCE = 90;

/**
 * Score de notoriété v1 (affiné en phase B via Wikidata) :
 * base 20 (pépite candidate), +20 si wikidata, +20 si wikipedia,
 * +10 pour un sommet ≥ 3000 m. ≥ 60 = incontournable probable.
 */
export function notorietyScore(tags: Record<string, string>, kind: string): number {
  let score = 20;
  if (tags['wikidata']) score += 20;
  if (tags['wikipedia']) score += 20;
  const ele = Number.parseInt(tags['ele'] ?? '', 10);
  if (kind === 'peak' && Number.isFinite(ele) && ele >= 3000) score += 10;
  return Math.min(score, 100);
}

/** Résumé télégraphique en français (données factuelles uniquement). */
export function buildSummary(tags: Record<string, string>, kind: string): string | null {
  const ele = Number.parseInt(tags['ele'] ?? '', 10);
  const eleStr = Number.isFinite(ele) ? `${ele} m` : null;
  switch (kind) {
    case 'peak':
      return eleStr ? `Sommet à ${eleStr}` : 'Sommet';
    case 'pass':
      return eleStr ? `Col à ${eleStr}` : 'Col';
    case 'refuge':
      return eleStr ? `Refuge à ${eleStr}` : 'Refuge de montagne';
    case 'glacier':
      return 'Glacier';
    case 'waterfall':
      return 'Cascade';
    default: {
      const description = tags['description:fr'] ?? tags['description'];
      if (description && description.length <= 120) return description;
      return null;
    }
  }
}

/**
 * Convertit un élément Overpass en lieu TRIPTIC.
 * Retourne null si inexploitable (sans nom ou sans coordonnées).
 */
export function osmElementToPlace(
  el: OverpassElement,
  category: OsmCategory,
  region: PlaceRegion | null,
): PlaceInput | null {
  const tags = el.tags ?? {};
  const name = tags['name'];
  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  if (!name || lat === undefined || lng === undefined) return null;

  const ele = Number.parseInt(tags['ele'] ?? '', 10);
  return {
    name,
    kind: category.kind,
    lat,
    lng,
    region,
    elevation_m: Number.isFinite(ele) ? ele : null,
    tags: category.tags,
    summary: buildSummary(tags, category.kind),
    notoriety: notorietyScore(tags, category.kind),
    confidence: OSM_CONFIDENCE,
    status: 'active',
    source: 'osm',
    source_id: `${el.type}/${el.id}`,
    source_url: `https://www.openstreetmap.org/${el.type}/${el.id}`,
    wikidata_id: tags['wikidata'] ?? null,
    wikipedia: tags['wikipedia'] ?? null,
  };
}
