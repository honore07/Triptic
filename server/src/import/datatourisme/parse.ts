import type { PlaceKind } from '@triptic/shared';
import type { PlaceInput } from '../../repo/places.js';
import { regionForPoint } from '../osm/regions.js';

/**
 * Types DATAtourisme importés (liste blanche — le reste est du bruit pour
 * TRIPTIC : restaurants, hôtels, agendas…). Clés sans préfixe d'espace de noms.
 */
const TYPE_TO_KIND: Record<string, PlaceKind> = {
  Museum: 'museum',
  Castle: 'castle',
  ParkAndGarden: 'attraction',
  RemarkableBuilding: 'attraction',
  ReligiousSite: 'attraction',
  ArcheologicalSite: 'attraction',
  CulturalSite: 'attraction',
  NaturalHeritage: 'poi',
  PointOfView: 'viewpoint',
  Camping: 'camp',
  WalkingTour: 'poi',
  CyclingTour: 'poi',
};

const KIND_TAGS: Record<string, string[]> = {
  Museum: ['culture'],
  Castle: ['culture', 'patrimoine'],
  ParkAndGarden: ['nature', 'culture'],
  RemarkableBuilding: ['culture', 'patrimoine'],
  ReligiousSite: ['culture', 'patrimoine'],
  ArcheologicalSite: ['culture', 'patrimoine'],
  CulturalSite: ['culture'],
  NaturalHeritage: ['nature'],
  PointOfView: ['panorama'],
  Camping: ['nuit', 'camping'],
  WalkingTour: ['rando'],
  CyclingTour: ['velo'],
};

/** Donnée institutionnelle (offices de tourisme) mais notoriété non prouvée. */
const DATATOURISME_CONFIDENCE = 80;
const DATATOURISME_NOTORIETY = 40;
const SUMMARY_MAX = 200;

type JsonValue = unknown;
type JsonObject = Record<string, JsonValue>;

/**
 * Extrait un libellé multilingue DATAtourisme, tolérant aux variantes JSON-LD :
 * {"fr": ["X"]} | {"@language":"fr","@value":"X"} | [{...}] | "X"
 */
export function pickLang(value: JsonValue, lang = 'fr'): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const picked = pickLang(item, lang);
      if (picked) return picked;
    }
    return null;
  }
  if (typeof value === 'object') {
    const obj = value as JsonObject;
    if (typeof obj['@value'] === 'string') {
      const language = obj['@language'];
      if (language === undefined || language === lang) return obj['@value'];
      return null;
    }
    const byLang = obj[lang];
    if (byLang !== undefined) return pickLang(byLang, lang);
    // Fallback : première langue disponible
    for (const key of Object.keys(obj)) {
      if (key.startsWith('@')) continue;
      const picked = pickLang(obj[key], lang);
      if (picked) return picked;
    }
  }
  return null;
}

/** Sans préfixe d'espace de noms : "schema:Museum" → "Museum". */
function stripPrefix(type: string): string {
  const idx = type.lastIndexOf(':');
  return idx === -1 ? type : type.slice(idx + 1);
}

function firstOf(value: JsonValue): JsonObject | null {
  if (Array.isArray(value)) return (value[0] as JsonObject) ?? null;
  if (value && typeof value === 'object') return value as JsonObject;
  return null;
}

function toNumber(value: JsonValue): number | null {
  const n = typeof value === 'string' ? Number.parseFloat(value) : (value as number);
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/** Coordonnées d'un POI DATAtourisme (isLocatedAt → schema:geo). */
export function extractGeo(obj: JsonObject): { lat: number; lng: number } | null {
  const located = firstOf(obj['isLocatedAt']);
  const geo = located ? firstOf(located['schema:geo']) : null;
  if (!geo) return null;
  const lat = toNumber(geo['schema:latitude']);
  const lng = toNumber(geo['schema:longitude']);
  if (lat === null || lng === null) return null;
  return { lat, lng };
}

/** Type importable du POI (première correspondance de la liste blanche). */
export function matchKind(obj: JsonObject): string | null {
  const types = obj['@type'];
  const list = Array.isArray(types) ? types : typeof types === 'string' ? [types] : [];
  for (const t of list) {
    if (typeof t !== 'string') continue;
    const stripped = stripPrefix(t);
    if (TYPE_TO_KIND[stripped]) return stripped;
  }
  return null;
}

/**
 * Convertit un objet POI DATAtourisme (JSON-LD) en lieu TRIPTIC.
 * Retourne null si hors liste blanche, sans nom/coords, ou hors périmètre pilote.
 */
export function datatourismeToPlace(obj: JsonObject): PlaceInput | null {
  const typeKey = matchKind(obj);
  if (!typeKey) return null;
  const name = pickLang(obj['rdfs:label']);
  const geo = extractGeo(obj);
  if (!name || !geo) return null;
  const region = regionForPoint(geo.lat, geo.lng);
  if (!region) return null;

  const description = firstOf(obj['hasDescription']);
  const rawSummary =
    pickLang(description?.['dc:description']) ?? pickLang(obj['rdfs:comment']);
  const summary =
    rawSummary && rawSummary.length > SUMMARY_MAX
      ? `${rawSummary.slice(0, SUMMARY_MAX - 1)}…`
      : rawSummary;

  const id = typeof obj['@id'] === 'string' ? obj['@id'] : null;
  const identifier = pickLang(obj['dc:identifier']) ?? id;
  if (!identifier) return null;

  return {
    name,
    kind: TYPE_TO_KIND[typeKey] as PlaceKind,
    lat: geo.lat,
    lng: geo.lng,
    region,
    tags: KIND_TAGS[typeKey] ?? [],
    summary: summary ?? null,
    notoriety: DATATOURISME_NOTORIETY,
    confidence: DATATOURISME_CONFIDENCE,
    status: 'active',
    source: 'datatourisme',
    source_id: identifier,
    source_url: id,
  };
}
