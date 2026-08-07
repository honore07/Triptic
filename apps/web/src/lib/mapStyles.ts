import type { SegmentMode, TripDay } from '@triptic/shared';
import { MAP_COLORS } from './mapColors';

/**
 * Styles de tracé par mode de déplacement (charte v2).
 *
 * Un tracé trek ou vélo ne doit jamais se lire comme une route voiture :
 * couleur ET motif de trait diffèrent, pour rester distinguables aussi
 * en vision daltonienne (le motif ne dépend pas de la couleur).
 * - car  : trait plein copper (lecture route classique)
 * - foot : pointillé serré pine (pas à pas)
 * - bike : tirets longs shadow grey (coups de pédale)
 */
export interface SegmentLineStyle {
  color: string;
  width: number;
  /** null = trait plein. Unités Mapbox : multiples de la largeur de ligne. */
  dasharray: [number, number] | null;
}

export const SEGMENT_LINE_STYLES: Record<SegmentMode, SegmentLineStyle> = {
  car: { color: MAP_COLORS.summit, width: 4, dasharray: null },
  foot: { color: MAP_COLORS.pine, width: 3, dasharray: [0.4, 1.6] },
  bike: { color: MAP_COLORS.trail, width: 3, dasharray: [2.2, 1.1] },
};

/** Ordre d'affichage stable (légende, comparaisons). */
export const SEGMENT_MODE_ORDER: readonly SegmentMode[] = ['car', 'foot', 'bike'];

/** Clés i18n des libellés de mode — les clés dynamiques cassent le grep i18n. */
export const MODE_LABEL_KEYS: Record<SegmentMode, string> = {
  car: 'map.mode_car',
  foot: 'map.mode_foot',
  bike: 'map.mode_bike',
};

export function segmentLineStyle(mode: SegmentMode): SegmentLineStyle {
  return SEGMENT_LINE_STYLES[mode];
}

/** Expression Mapbox data-driven — évite 3 layers par propriété. */
type MapboxExpression = unknown[];

export function lineColorExpression(): MapboxExpression {
  return [
    'match',
    ['get', 'mode'],
    'foot',
    SEGMENT_LINE_STYLES.foot.color,
    'bike',
    SEGMENT_LINE_STYLES.bike.color,
    SEGMENT_LINE_STYLES.car.color,
  ];
}

/** @param extra épaisseur ajoutée (casing blanc de contraste sous le tracé). */
export function lineWidthExpression(extra = 0): MapboxExpression {
  return [
    'match',
    ['get', 'mode'],
    'foot',
    SEGMENT_LINE_STYLES.foot.width + extra,
    'bike',
    SEGMENT_LINE_STYLES.bike.width + extra,
    SEGMENT_LINE_STYLES.car.width + extra,
  ];
}

/** Trait plein exprimé en [1, 0] — seule forme acceptée par le match. */
export function lineDasharrayExpression(): MapboxExpression {
  const literal = (style: SegmentLineStyle): MapboxExpression => [
    'literal',
    style.dasharray ?? [1, 0],
  ];
  return [
    'match',
    ['get', 'mode'],
    'foot',
    literal(SEGMENT_LINE_STYLES.foot),
    'bike',
    literal(SEGMENT_LINE_STYLES.bike),
    literal(SEGMENT_LINE_STYLES.car),
  ];
}

/** Modes réellement présents dans le trip, en ordre stable. */
export function tripModes(days: TripDay[] | undefined): SegmentMode[] {
  const seen = new Set<SegmentMode>();
  for (const day of days ?? []) {
    for (const segment of day.segments ?? []) seen.add(segment.mode);
  }
  return SEGMENT_MODE_ORDER.filter((mode) => seen.has(mode));
}

/** La légende n'a de sens que si au moins 2 modes cohabitent sur la carte. */
export function shouldShowLegend(days: TripDay[] | undefined): boolean {
  return tripModes(days).length >= 2;
}

/**
 * Style du tracé de repli (aucun segment routé : routeur down ou zone hors
 * couverture). On relie les waypoints en ligne droite — mais visiblement, et
 * dans la couleur du mode dominant, jamais en pointillé fantôme copper.
 * Le trait franchement tireté signale « estimation, pas un vrai sentier ».
 */
export function fallbackLineStyle(days: TripDay[] | undefined): {
  color: string;
  dasharray: [number, number];
} {
  const mode = tripModes(days)[0] ?? 'car';
  return { color: SEGMENT_LINE_STYLES[mode].color, dasharray: [1.5, 1.5] };
}

/**
 * Icônes Lucide inline (car / footprints / bike) pour les bulles de trajet —
 * DOM construit hors React. Pas d'emoji dans l'UI produit (charte).
 * `currentColor` : lisible sur bulle sombre (routée) comme claire (estimée).
 */
const ICON_PATHS: Record<SegmentMode, string> = {
  car: '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>',
  foot: '<path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z"/><path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z"/><path d="M16 17h4"/><path d="M4 13h4"/>',
  bike: '<circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/>',
};

export function modeIconSvg(mode: SegmentMode): string {
  return (
    `<svg data-mode="${mode}" width="12" height="12" viewBox="0 0 24 24" fill="none" ` +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ' +
    `aria-hidden="true">${ICON_PATHS[mode]}</svg>`
  );
}
