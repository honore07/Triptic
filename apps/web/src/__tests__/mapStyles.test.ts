import { describe, expect, it } from 'vitest';
import type { TripDay, TripSegment } from '@triptic/shared';
import {
  SEGMENT_LINE_STYLES,
  fallbackLineStyle,
  lineColorExpression,
  lineDasharrayExpression,
  lineWidthExpression,
  modeIconSvg,
  segmentLineStyle,
  shouldShowLegend,
  tripModes,
} from '../lib/mapStyles';

const day = (dayNumber: number, modes: TripSegment['mode'][]): TripDay => ({
  day: dayNumber,
  title: `J${dayNumber}`,
  activities: [],
  segments: modes.map((mode) => ({ mode, distance_km: 10, duration_min: 30 })),
});

describe('segmentLineStyle', () => {
  it('donne une couleur distincte à chaque mode', () => {
    const colors = (['car', 'foot', 'bike'] as const).map((m) => segmentLineStyle(m).color);
    expect(new Set(colors).size).toBe(3);
  });

  it('trait plein pour la voiture, motifs différents pour pied et vélo', () => {
    expect(segmentLineStyle('car').dasharray).toBeNull();
    expect(segmentLineStyle('foot').dasharray).not.toBeNull();
    expect(segmentLineStyle('bike').dasharray).not.toBeNull();
    // Distinguables même en vision daltonienne : le motif diffère aussi
    expect(segmentLineStyle('foot').dasharray).not.toEqual(segmentLineStyle('bike').dasharray);
  });
});

describe('expressions Mapbox data-driven', () => {
  it('line-color matche le mode du feature avec les couleurs de la charte', () => {
    expect(lineColorExpression()).toEqual([
      'match',
      ['get', 'mode'],
      'foot',
      SEGMENT_LINE_STYLES.foot.color,
      'bike',
      SEGMENT_LINE_STYLES.bike.color,
      SEGMENT_LINE_STYLES.car.color,
    ]);
  });

  it('line-width accepte un surplus pour le casing de contraste', () => {
    const widths = lineWidthExpression(3);
    expect(widths).toContain(SEGMENT_LINE_STYLES.car.width + 3);
    expect(widths).toContain(SEGMENT_LINE_STYLES.foot.width + 3);
  });

  it('line-dasharray encode le trait plein en [1, 0] (fallback car)', () => {
    const expr = lineDasharrayExpression();
    expect(expr[0]).toBe('match');
    expect(expr[expr.length - 1]).toEqual(['literal', [1, 0]]);
    expect(expr).toContainEqual(['literal', SEGMENT_LINE_STYLES.foot.dasharray]);
  });
});

describe('tripModes / shouldShowLegend', () => {
  it('liste les modes présents, dédoublonnés, en ordre stable', () => {
    const days = [day(1, ['foot', 'car']), day(2, ['car']), day(3, ['bike'])];
    expect(tripModes(days)).toEqual(['car', 'foot', 'bike']);
  });

  it('ignore les jours sans segments et tolère undefined', () => {
    expect(tripModes(undefined)).toEqual([]);
    expect(tripModes([{ day: 1, title: 'J1', activities: [] }])).toEqual([]);
  });

  it('la légende n’apparaît qu’à partir de 2 modes différents', () => {
    expect(shouldShowLegend([day(1, ['car', 'car'])])).toBe(false);
    expect(shouldShowLegend([day(1, ['car', 'foot'])])).toBe(true);
    expect(shouldShowLegend(undefined)).toBe(false);
  });
});

describe('fallbackLineStyle', () => {
  it('prend la couleur du mode dominant, pas le copper voiture par défaut', () => {
    expect(fallbackLineStyle([day(1, ['foot'])]).color).toBe(SEGMENT_LINE_STYLES.foot.color);
    expect(fallbackLineStyle([day(1, ['bike'])]).color).toBe(SEGMENT_LINE_STYLES.bike.color);
  });

  it('retombe sur la voiture sans segment, avec un tireté visible', () => {
    const style = fallbackLineStyle(undefined);
    expect(style.color).toBe(SEGMENT_LINE_STYLES.car.color);
    // Tireté franc (pas le [0.1, 2] fantôme d'avant) : les deux valeurs ≥ 1
    expect(style.dasharray[0]).toBeGreaterThanOrEqual(1);
    expect(style.dasharray[1]).toBeGreaterThanOrEqual(1);
  });
});

describe('modeIconSvg', () => {
  it('produit un SVG décoratif identifiable par mode', () => {
    for (const mode of ['car', 'foot', 'bike'] as const) {
      const svg = modeIconSvg(mode);
      expect(svg).toContain(`data-mode="${mode}"`);
      expect(svg).toContain('aria-hidden="true"');
      expect(svg).toContain('stroke="currentColor"');
    }
  });
});
