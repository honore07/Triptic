import type { PlaceKind } from '@triptic/shared';
import type { Bbox } from './regions.js';

export interface OsmCategory {
  kind: PlaceKind;
  /** Sélecteurs Overpass appliqués à nwr (node/way/relation). Nom requis. */
  selectors: string[];
  /** Tags d'ambiance TRIPTIC associés à ce type de lieu. */
  tags: string[];
}

/**
 * Catégories outdoor importées depuis OSM.
 * Les villages notables ne viennent pas d'OSM (trop de bruit) : ils arrivent
 * en phase B via Wikidata/DATAtourisme.
 */
export const OSM_CATEGORIES: OsmCategory[] = [
  { kind: 'peak', selectors: ['[natural=peak][name]'], tags: ['montagne', 'panorama'] },
  { kind: 'pass', selectors: ['[mountain_pass=yes][name]'], tags: ['montagne', 'route'] },
  { kind: 'lake', selectors: ['[natural=water][water=lake][name]'], tags: ['eau', 'nature'] },
  { kind: 'waterfall', selectors: ['[waterway=waterfall][name]'], tags: ['eau', 'nature'] },
  {
    kind: 'gorge',
    selectors: ['[natural=gorge][name]', '[natural=canyon][name]'],
    tags: ['nature', 'spectaculaire'],
  },
  { kind: 'glacier', selectors: ['[natural=glacier][name]'], tags: ['montagne', 'glacier'] },
  { kind: 'viewpoint', selectors: ['[tourism=viewpoint][name]'], tags: ['panorama'] },
  {
    kind: 'refuge',
    selectors: ['[tourism=alpine_hut][name]', '[tourism=wilderness_hut][name]'],
    tags: ['montagne', 'nuit'],
  },
  { kind: 'camp', selectors: ['[tourism=camp_site][name]'], tags: ['nuit', 'camping'] },
  { kind: 'castle', selectors: ['[historic=castle][name]'], tags: ['culture', 'patrimoine'] },
  { kind: 'museum', selectors: ['[tourism=museum][name]'], tags: ['culture'] },
  { kind: 'attraction', selectors: ['[tourism=attraction][name]'], tags: ['visite'] },
  // Food (roadmap 0.4) — pour « search this area » (phase 4), pas pour le
  // grounding des trips. ⚠️ Couverture OSM inégale en zone rurale : l'UI ne
  // doit pas prétendre à l'exhaustivité.
  { kind: 'restaurant', selectors: ['[amenity=restaurant][name]'], tags: ['food'] },
  { kind: 'cafe', selectors: ['[amenity=cafe][name]'], tags: ['food'] },
  { kind: 'bar', selectors: ['[amenity=bar][name]'], tags: ['food'] },
  { kind: 'fast_food', selectors: ['[amenity=fast_food][name]'], tags: ['food'] },
];

/** Requête Overpass QL pour une catégorie sur une bbox. */
export function buildOverpassQuery(category: OsmCategory, bbox: Bbox): string {
  const bboxStr = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
  const parts = category.selectors.map((s) => `nwr${s}(${bboxStr});`).join('\n  ');
  return `[out:json][timeout:180];\n(\n  ${parts}\n);\nout tags center qt;`;
}
