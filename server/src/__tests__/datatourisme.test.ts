import { describe, expect, it } from 'vitest';
import {
  datatourismeToPlace,
  extractGeo,
  matchKind,
  pickLang,
} from '../import/datatourisme/parse.js';
import { villageToPlace } from '../import/wikidata/importVillages.js';
import {
  chunk,
  notorietyFromSitelinks,
  parseWktPoint,
} from '../import/wikidata/wikidataUtils.js';
import { regionForPoint } from '../import/osm/regions.js';

describe('pickLang', () => {
  it('gère les variantes JSON-LD de DATAtourisme', () => {
    expect(pickLang({ fr: ['Château du Haut-Kœnigsbourg'] })).toBe(
      'Château du Haut-Kœnigsbourg',
    );
    expect(pickLang({ '@language': 'fr', '@value': 'Musée Unterlinden' })).toBe(
      'Musée Unterlinden',
    );
    expect(pickLang([{ '@language': 'de', '@value': 'X' }, { '@language': 'fr', '@value': 'Y' }])).toBe('Y');
    expect(pickLang('Simple')).toBe('Simple');
    expect(pickLang(null)).toBeNull();
  });

  it("retombe sur la première langue disponible si pas de français", () => {
    expect(pickLang({ de: ['Nur Deutsch'] })).toBe('Nur Deutsch');
  });
});

describe('matchKind / extractGeo', () => {
  it('reconnaît les types préfixés ou non de la liste blanche', () => {
    expect(matchKind({ '@type': ['schema:Museum', 'PointOfInterest'] })).toBe('Museum');
    expect(matchKind({ '@type': ['Camping'] })).toBe('Camping');
    expect(matchKind({ '@type': ['FoodEstablishment'] })).toBeNull();
  });

  it('extrait lat/lng depuis isLocatedAt → schema:geo (valeurs string)', () => {
    const obj = {
      isLocatedAt: [{ 'schema:geo': { 'schema:latitude': '48.2494', 'schema:longitude': '7.3444' } }],
    };
    expect(extractGeo(obj)).toEqual({ lat: 48.2494, lng: 7.3444 });
    expect(extractGeo({})).toBeNull();
  });
});

describe('datatourismeToPlace', () => {
  const poi = {
    '@id': 'https://data.datatourisme.fr/x/abc-123',
    '@type': ['schema:TouristAttraction', 'Castle'],
    'rdfs:label': { fr: ['Château du Haut-Kœnigsbourg'] },
    'dc:identifier': 'HKB-001',
    isLocatedAt: [
      { 'schema:geo': { 'schema:latitude': '48.2494', 'schema:longitude': '7.3444' } },
    ],
    hasDescription: [{ 'dc:description': { fr: ['Forteresse du XIIe siècle dominant la plaine d’Alsace.'] } }],
  };

  it('mappe un POI complet (région pilote, source datatourisme)', () => {
    const place = datatourismeToPlace(poi)!;
    expect(place).toMatchObject({
      name: 'Château du Haut-Kœnigsbourg',
      kind: 'castle',
      region: 'alsace-vosges',
      notoriety: 40,
      confidence: 80,
      source: 'datatourisme',
      source_id: 'HKB-001',
    });
    expect(place.summary).toContain('Forteresse');
  });

  it('rejette les POI hors périmètre pilote', () => {
    const brest = {
      ...poi,
      isLocatedAt: [
        { 'schema:geo': { 'schema:latitude': '48.39', 'schema:longitude': '-4.49' } },
      ],
    };
    expect(datatourismeToPlace(brest)).toBeNull();
  });

  it('rejette les types hors liste blanche (restaurants…)', () => {
    expect(datatourismeToPlace({ ...poi, '@type': ['schema:Restaurant'] })).toBeNull();
  });

  it('tronque les résumés trop longs', () => {
    const long = {
      ...poi,
      hasDescription: [{ 'dc:description': { fr: ['x'.repeat(500)] } }],
    };
    const place = datatourismeToPlace(long)!;
    expect(place.summary!.length).toBeLessThanOrEqual(200);
    expect(place.summary!.endsWith('…')).toBe(true);
  });
});

describe('wikidata utils', () => {
  it('notorietyFromSitelinks : paliers incontournable → pépite', () => {
    expect(notorietyFromSitelinks(40)).toBe(90);
    expect(notorietyFromSitelinks(10)).toBe(75);
    expect(notorietyFromSitelinks(5)).toBe(60);
    expect(notorietyFromSitelinks(2)).toBe(45);
    expect(notorietyFromSitelinks(0)).toBe(30);
  });

  it('parseWktPoint : "Point(lon lat)" SPARQL', () => {
    expect(parseWktPoint('Point(7.3444 48.2494)')).toEqual({ lat: 48.2494, lng: 7.3444 });
    expect(parseWktPoint('POLYGON(...)')).toBeNull();
  });

  it('chunk découpe en lots de 50 (limite wbgetentities)', () => {
    expect(chunk(new Array(120).fill(0), 50).map((c) => c.length)).toEqual([50, 50, 20]);
  });
});

describe('villageToPlace', () => {
  it('mappe un village classé dans le périmètre (Eguisheim)', () => {
    const place = villageToPlace(
      {
        item: { value: 'http://www.wikidata.org/entity/Q22690' },
        itemLabel: { value: 'Eguisheim' },
        coord: { value: 'Point(7.3053 48.0428)' },
      },
      'Plus Beaux Villages de France',
    )!;
    expect(place).toMatchObject({
      name: 'Eguisheim',
      kind: 'village',
      region: 'alsace-vosges',
      notoriety: 75,
      source: 'wikidata',
      source_id: 'Q22690',
      wikidata_id: 'Q22690',
    });
  });

  it('rejette un village hors périmètre (Bretagne)', () => {
    expect(
      villageToPlace(
        {
          item: { value: 'http://www.wikidata.org/entity/Q1' },
          itemLabel: { value: 'Locronan' },
          coord: { value: 'Point(-4.2094 48.0981)' },
        },
        'Plus Beaux Villages de France',
      ),
    ).toBeNull();
  });
});

describe('regionForPoint', () => {
  it('affecte la bonne région pilote', () => {
    expect(regionForPoint(48.06, 7.02)).toBe('alsace-vosges'); // Hohneck
    expect(regionForPoint(45.92, 6.87)).toBe('alpes-fr'); // Chamonix
    expect(regionForPoint(46.02, 7.75)).toBe('alpes-ch'); // Zermatt
    expect(regionForPoint(46.54, 11.56)).toBe('alpes-it'); // Dolomites
    expect(regionForPoint(48.85, 2.35)).toBeNull(); // Paris
  });
});
