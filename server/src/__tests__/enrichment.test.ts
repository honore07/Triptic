import { describe, expect, it, vi } from 'vitest';
import { bboxForPoints, zoneKey, EnrichmentService } from '../services/enrichment.js';
import type { OverpassElement } from '../import/osm/overpassClient.js';

const SLOVENIA_POINTS = [
  { lat: 46.36, lng: 13.83 }, // Kranjska Gora
  { lat: 46.28, lng: 13.9 }, // vallée de la Soča
  { lat: 46.05, lng: 14.5 }, // Ljubljana
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('bboxForPoints', () => {
  it('bbox englobante avec marge de 0.15°', () => {
    const bbox = bboxForPoints(SLOVENIA_POINTS)!;
    expect(bbox.south).toBeCloseTo(45.9, 5);
    expect(bbox.north).toBeCloseTo(46.51, 5);
    expect(bbox.west).toBeCloseTo(13.68, 5);
    expect(bbox.east).toBeCloseTo(14.65, 5);
  });

  it('null sans points', () => {
    expect(bboxForPoints([])).toBeNull();
  });
});

describe('zoneKey', () => {
  it('arrondit au demi-degré (dédup de zones proches)', () => {
    const a = zoneKey({ south: 45.9, west: 13.68, north: 46.51, east: 14.65 });
    const b = zoneKey({ south: 45.93, west: 13.71, north: 46.49, east: 14.61 });
    expect(a).toBe(b);
  });
});

describe('EnrichmentService', () => {
  const OSM_PEAK: OverpassElement = {
    type: 'node',
    id: 99,
    lat: 46.37,
    lon: 13.84,
    tags: { name: 'Triglav', ele: '2864', wikidata: 'Q15882' },
  };

  function makeService(): {
    service: EnrichmentService;
    upserts: unknown[][];
    fetches: string[];
  } {
    const upserts: unknown[][] = [];
    const fetches: string[] = [];
    const repo = {
      bulkUpsert: vi.fn(async (inputs: unknown[]) => {
        upserts.push(inputs);
        return inputs.length;
      }),
    };
    const service = new EnrichmentService(repo, {
      fetchImpl: async (query: string) => {
        fetches.push(query);
        return query.includes('natural=peak') ? [OSM_PEAK] : [];
      },
    });
    return { service, upserts, fetches };
  }

  it("n'enrichit pas une zone déjà couverte (shortlist suffisante)", async () => {
    const { service, fetches } = makeService();
    service.maybeEnrich(SLOVENIA_POINTS, 42);
    await sleep(20);
    expect(fetches).toHaveLength(0);
  });

  it('enrichit une zone sous-couverte et déduplique les zones', async () => {
    const { service, upserts, fetches } = makeService();
    service.maybeEnrich(SLOVENIA_POINTS, 0);
    service.maybeEnrich(SLOVENIA_POINTS, 1); // même zone → ignorée
    await sleep(50);
    expect(fetches.length).toBeGreaterThan(0);
    // 7 catégories express interrogées, une seule fois chacune
    expect(fetches.length).toBe(7);
    // le sommet OSM a été inséré (region null : hors périmètre pilote)
    const inserted = upserts.flat() as { name: string; region: unknown }[];
    expect(inserted.some((p) => p.name === 'Triglav' && p.region === null)).toBe(true);
  });
});
