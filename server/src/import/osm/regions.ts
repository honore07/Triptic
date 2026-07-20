import type { PlaceRegion } from '@triptic/shared';

/** Bbox Overpass : sud, ouest, nord, est (degrés WGS84). */
export interface Bbox {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface ImportRegion {
  id: PlaceRegion;
  label: string;
  /** Découpé en sous-bbox pour rester sous les timeouts Overpass. */
  bboxes: Bbox[];
}

/**
 * Périmètre pilote : Alsace-Vosges + arc alpin FR/CH/IT.
 * Les chevauchements de bbox sont sans risque : l'upsert (source, source_id)
 * garantit qu'un même élément OSM n'entre qu'une fois.
 */
/** Région pilote contenant ce point, ou null si hors périmètre. */
export function regionForPoint(lat: number, lng: number): PlaceRegion | null {
  for (const region of IMPORT_REGIONS) {
    for (const b of region.bboxes) {
      if (lat >= b.south && lat <= b.north && lng >= b.west && lng <= b.east) {
        return region.id;
      }
    }
  }
  return null;
}

export const IMPORT_REGIONS: ImportRegion[] = [
  {
    id: 'alsace-vosges',
    label: 'Alsace & Vosges',
    bboxes: [{ south: 47.35, west: 6.6, north: 49.15, east: 8.35 }],
  },
  {
    id: 'alpes-fr',
    label: 'Alpes françaises',
    bboxes: [
      { south: 45.0, west: 4.9, north: 46.6, east: 7.25 }, // Nord : Chartreuse → Mont-Blanc
      { south: 43.6, west: 4.9, north: 45.0, east: 7.8 }, // Sud : Écrins → Mercantour
    ],
  },
  {
    id: 'alpes-ch',
    label: 'Alpes suisses',
    bboxes: [
      { south: 45.8, west: 6.7, north: 46.9, east: 8.6 }, // Valais, Oberland bernois
      { south: 46.0, west: 8.6, north: 47.1, east: 10.6 }, // Suisse centrale et est, Grisons
    ],
  },
  {
    id: 'alpes-it',
    label: 'Alpes italiennes',
    bboxes: [
      { south: 44.0, west: 6.6, north: 46.0, east: 8.6 }, // Piémont, Val d'Aoste
      { south: 45.6, west: 8.6, north: 46.8, east: 10.7 }, // Lombardie
      { south: 45.5, west: 10.7, north: 47.1, east: 12.6 }, // Trentin-Haut-Adige, Dolomites
      { south: 45.9, west: 12.6, north: 46.8, east: 13.95 }, // Frioul
    ],
  },
];
