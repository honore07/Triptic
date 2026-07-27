import { describe, expect, it, vi } from 'vitest';
import { trekCoordinates, trekToPlace } from '../import/geotrek/parseTrek.js';
import { GEOTREK_PORTALS } from '../import/geotrek/portals.js';
import {
  isFfrpProtected,
  relationCoordinates,
  trailRelationToPlace,
} from '../import/osm/trailRelations.js';
import { ElevationService } from '../services/elevation.js';

const PORTAL = GEOTREK_PORTALS[0]!;

describe('trekToPlace (Geotrek 5.1)', () => {
  const TREK = {
    id: 42,
    name: { fr: 'Tour du Hohneck' },
    description_teaser: { fr: 'Boucle des crêtes et des lacs.' },
    length_2d: 12480,
    ascent: 520,
    duration: null,
    geometry: {
      type: 'LineString',
      coordinates: [
        [7.0209, 48.0631, 1139],
        [7.0086, 48.0403, 1363],
      ],
    },
  };

  it('mappe un trek en lieu kind trail avec trace et résumé factuel', () => {
    const place = trekToPlace(TREK, PORTAL)!;
    expect(place).toMatchObject({
      name: 'Tour du Hohneck',
      kind: 'trail',
      region: 'alsace-vosges',
      source: 'geotrek-pnr-ballons-vosges',
      source_id: '42',
    });
    expect(place.summary).toContain('12.5 km');
    expect(place.summary).toContain('520 m D+');
    expect(place.trace).toHaveLength(2);
    expect(place.trace?.[0]).toEqual([7.0209, 48.0631]); // 3D → 2D, ordre lng/lat
  });

  it('rejette un trek hors périmètre pilote ou sans géométrie', () => {
    expect(trekToPlace({ ...TREK, geometry: null }, PORTAL)).toBeNull();
    const brest = {
      ...TREK,
      geometry: { type: 'LineString', coordinates: [[-4.49, 48.39], [-4.5, 48.4]] },
    };
    expect(trekToPlace(brest, PORTAL)).toBeNull();
  });

  it('aplati les MultiLineString', () => {
    const coords = trekCoordinates({
      type: 'MultiLineString',
      coordinates: [[[7.0, 48.0]], [[7.1, 48.1]]],
    });
    expect(coords).toEqual([
      [7.0, 48.0],
      [7.1, 48.1],
    ]);
  });
});

describe('garde-fou FFRandonnée (5.1 — légal)', () => {
  it('exclut GR, GRP et balisage rouge-blanc / jaune-rouge', () => {
    expect(isFfrpProtected({ name: 'GR 5 — Traversée des Vosges' })).toBe(true);
    expect(isFfrpProtected({ name: 'Traversée', ref: 'GR53' })).toBe(true);
    expect(isFfrpProtected({ name: 'Tour du lac', 'osmc:symbol': 'red:white:red_bar' })).toBe(true);
    expect(isFfrpProtected({ name: 'Boucle du lac', 'osmc:symbol': 'yellow:red:yellow_lower' })).toBe(true);
  });

  it('garde les boucles locales (balisage Club Vosgien etc.)', () => {
    expect(isFfrpProtected({ name: 'Tour du Hohneck', 'osmc:symbol': 'red:white:red_circle' })).toBe(false);
    expect(isFfrpProtected({ name: 'Sentier des Roches' })).toBe(false);
    expect(isFfrpProtected({ name: 'Grande boucle de Munster' })).toBe(false);
  });
});

describe('trailRelationToPlace (OSM 5.1)', () => {
  const RELATION = {
    type: 'relation',
    id: 123,
    tags: { name: 'Tour du Hohneck', distance: '12.5' },
    members: [
      {
        type: 'way',
        geometry: [
          { lat: 48.0631, lon: 7.0209 },
          { lat: 48.0403, lon: 7.0086 },
        ],
      },
      { type: 'way', geometry: [{ lat: 48.0403, lon: 7.0086 }, { lat: 47.99, lon: 7.05 }] },
    ],
  };

  it('concatène les membres sans dupliquer les points de jonction', () => {
    expect(relationCoordinates(RELATION)).toEqual([
      [7.0209, 48.0631],
      [7.0086, 48.0403],
      [7.05, 47.99],
    ]);
  });

  it('mappe une relation en trail ODbL avec distance dans le résumé', () => {
    const place = trailRelationToPlace(RELATION)!;
    expect(place).toMatchObject({ kind: 'trail', source: 'osm', source_id: 'relation/123' });
    expect(place.summary).toContain('12.5 km');
  });

  it('refuse les relations FFRP', () => {
    expect(
      trailRelationToPlace({ ...RELATION, tags: { name: 'GR 5', distance: '120' } }),
    ).toBeNull();
  });
});

describe('ElevationService (5.3)', () => {
  it('calcule le dénivelé cumulé avec seuil anti-bruit', async () => {
    const elevations = [1000, 1003, 1050, 1040, 1100]; // +3 ignoré (< 8 m), +50, -10, +60
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ results: elevations.map((e) => ({ elevation: e })) })),
    );
    const service = new ElevationService('http://localhost:5000', 'cop30', fetchMock as unknown as typeof fetch);
    const gain = await service.elevationGain([
      [7.0, 48.0],
      [7.01, 48.01],
      [7.02, 48.02],
      [7.03, 48.03],
      [7.04, 48.04],
    ]);
    expect(gain).toBe(110);
  });

  it('désactivé sans URL, null en erreur réseau', async () => {
    const disabled = new ElevationService(null);
    expect(disabled.enabled).toBe(false);
    expect(await disabled.elevationGain([[7, 48], [7.1, 48.1]])).toBeNull();

    const failing = new ElevationService(
      'http://localhost:5000',
      'cop30',
      vi.fn(async () => {
        throw new Error('down');
      }) as unknown as typeof fetch,
    );
    expect(await failing.elevationGain([[7, 48], [7.1, 48.1]])).toBeNull();
  });
});
