import { describe, expect, it } from 'vitest';
import { buildOverpassQuery, OSM_CATEGORIES } from '../import/osm/categories.js';
import { IMPORT_REGIONS } from '../import/osm/regions.js';
import { buildSummary, notorietyScore, osmElementToPlace } from '../import/osm/mapElement.js';
import {
  normalizePlaceName,
  splitShortlistLimits,
  toCorridorWkt,
  toPointWkt,
} from '../repo/places.js';
import type { OverpassElement } from '../import/osm/overpassClient.js';

const PEAK_CATEGORY = OSM_CATEGORIES.find((c) => c.kind === 'peak')!;

describe('IMPORT_REGIONS', () => {
  it('couvre le périmètre pilote : Alsace-Vosges + Alpes FR/CH/IT', () => {
    expect(IMPORT_REGIONS.map((r) => r.id)).toEqual([
      'alsace-vosges',
      'alpes-fr',
      'alpes-ch',
      'alpes-it',
    ]);
  });

  it('a des bbox cohérentes (sud < nord, ouest < est)', () => {
    for (const region of IMPORT_REGIONS) {
      for (const b of region.bboxes) {
        expect(b.south).toBeLessThan(b.north);
        expect(b.west).toBeLessThan(b.east);
      }
    }
  });
});

describe('buildOverpassQuery', () => {
  it('construit une requête nwr avec bbox sud,ouest,nord,est', () => {
    const query = buildOverpassQuery(PEAK_CATEGORY, {
      south: 47.35,
      west: 6.6,
      north: 49.15,
      east: 8.35,
    });
    expect(query).toContain('nwr[natural=peak][name](47.35,6.6,49.15,8.35);');
    expect(query).toContain('[out:json]');
    expect(query).toContain('out tags center qt;');
  });

  it('combine plusieurs sélecteurs (refuge = alpine_hut + wilderness_hut)', () => {
    const refuge = OSM_CATEGORIES.find((c) => c.kind === 'refuge')!;
    const query = buildOverpassQuery(refuge, { south: 45, west: 6, north: 46, east: 7 });
    expect(query).toContain('nwr[tourism=alpine_hut][name](45,6,46,7);');
    expect(query).toContain('nwr[tourism=wilderness_hut][name](45,6,46,7);');
  });
});

describe('notorietyScore', () => {
  it('score de base 20 (pépite candidate) sans wikidata/wikipedia', () => {
    expect(notorietyScore({}, 'lake')).toBe(20);
  });

  it('+20 wikidata, +20 wikipedia → 60 = incontournable probable', () => {
    expect(notorietyScore({ wikidata: 'Q123', wikipedia: 'fr:Lac Blanc' }, 'lake')).toBe(60);
  });

  it('+10 pour un sommet ≥ 3000 m', () => {
    expect(notorietyScore({ ele: '4808', wikidata: 'Q583', wikipedia: 'fr:Mont Blanc' }, 'peak')).toBe(70);
    expect(notorietyScore({ ele: '1424' }, 'peak')).toBe(20);
  });
});

describe('osmElementToPlace', () => {
  const node: OverpassElement = {
    type: 'node',
    id: 123456,
    lat: 48.0403,
    lon: 7.0086,
    tags: { name: 'Le Hohneck', ele: '1363', wikidata: 'Q669625', wikipedia: 'fr:Hohneck' },
  };

  it('mappe un node OSM en lieu TRIPTIC complet', () => {
    const place = osmElementToPlace(node, PEAK_CATEGORY, 'alsace-vosges')!;
    expect(place).toMatchObject({
      name: 'Le Hohneck',
      kind: 'peak',
      lat: 48.0403,
      lng: 7.0086,
      region: 'alsace-vosges',
      elevation_m: 1363,
      notoriety: 60,
      confidence: 90,
      source: 'osm',
      source_id: 'node/123456',
      wikidata_id: 'Q669625',
    });
    expect(place.source_url).toBe('https://www.openstreetmap.org/node/123456');
    expect(place.summary).toBe('Sommet à 1363 m');
  });

  it('utilise center pour les ways/relations (out center)', () => {
    const way: OverpassElement = {
      type: 'way',
      id: 42,
      center: { lat: 47.9, lon: 7.1 },
      tags: { name: 'Lac du Ballon' },
    };
    const lake = OSM_CATEGORIES.find((c) => c.kind === 'lake')!;
    const place = osmElementToPlace(way, lake, 'alsace-vosges')!;
    expect(place.lat).toBe(47.9);
    expect(place.lng).toBe(7.1);
    expect(place.source_id).toBe('way/42');
  });

  it('rejette les éléments sans nom ou sans coordonnées', () => {
    expect(osmElementToPlace({ type: 'node', id: 1, lat: 48, lon: 7, tags: {} }, PEAK_CATEGORY, 'alpes-fr')).toBeNull();
    expect(
      osmElementToPlace({ type: 'way', id: 2, tags: { name: 'Sans coords' } }, PEAK_CATEGORY, 'alpes-fr'),
    ).toBeNull();
  });
});

describe('buildSummary', () => {
  it('résumés factuels selon le type', () => {
    expect(buildSummary({ ele: '2744' }, 'pass')).toBe('Col à 2744 m');
    expect(buildSummary({}, 'waterfall')).toBe('Cascade');
    expect(buildSummary({}, 'refuge')).toBe('Refuge de montagne');
  });

  it('reprend la description OSM courte pour les autres types', () => {
    expect(buildSummary({ description: 'Château fort du XIIe siècle' }, 'castle')).toBe(
      'Château fort du XIIe siècle',
    );
    expect(buildSummary({ description: 'x'.repeat(200) }, 'castle')).toBeNull();
  });
});

describe('helpers repo places', () => {
  it('toPointWkt en ordre lon lat (PostGIS)', () => {
    expect(toPointWkt(48.0631, 7.0209)).toBe('POINT(7.0209 48.0631)');
  });

  it('toCorridorWkt : LINESTRING multi-points, POINT si un seul, null si vide', () => {
    expect(
      toCorridorWkt([
        { lat: 48.0631, lng: 7.0209 },
        { lat: 48.0403, lng: 7.0086 },
      ]),
    ).toBe('LINESTRING(7.0209 48.0631, 7.0086 48.0403)');
    expect(toCorridorWkt([{ lat: 48, lng: 7 }])).toBe('POINT(7 48)');
    expect(toCorridorWkt([])).toBeNull();
    // points consécutifs identiques fusionnés (LINESTRING dégénéré sinon)
    expect(
      toCorridorWkt([
        { lat: 48, lng: 7 },
        { lat: 48, lng: 7 },
      ]),
    ).toBe('POINT(7 48)');
  });

  it('splitShortlistLimits : plus de pépites quand le curseur Exploration monte', () => {
    expect(splitShortlistLimits(60, 1)).toEqual({ majors: 48, gems: 12 });
    expect(splitShortlistLimits(60, 3)).toEqual({ majors: 36, gems: 24 });
    expect(splitShortlistLimits(60, 5)).toEqual({ majors: 24, gems: 36 });
    expect(splitShortlistLimits(60)).toEqual(splitShortlistLimits(60, 3));
  });

  it('normalizePlaceName retire accents et casse', () => {
    expect(normalizePlaceName('Château du Haut-Kœnigsbourg ')).toBe(
      'chateau du haut-kœnigsbourg',
    );
    expect(normalizePlaceName('Lac Blanc')).toBe(normalizePlaceName('lac blanc'));
  });
});
