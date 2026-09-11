import { describe, expect, it, vi } from 'vitest';
import type { TripDay, TripSegment } from '@triptic/shared';
import { createTimeBubble, segmentAnchor } from '../components/MapView';

const activity = (lat: number, lng: number) => ({
  type: 'visit' as const,
  time_of_day: 'morning' as const,
  title: 'x',
  lat,
  lng,
});

const day: TripDay = {
  day: 1,
  title: 'J1',
  activities: [activity(48, 7), activity(49, 8)],
};

const segment = (over: Partial<TripSegment> = {}): TripSegment => ({
  distance_km: 20.4,
  duration_min: 23.6,
  mode: 'car',
  ...over,
});

describe('segmentAnchor', () => {
  it('prend le milieu du tracé quand le segment est routé', () => {
    const geometry: [number, number][] = [
      [7, 48],
      [7.2, 48.1],
      [7.4, 48.2],
    ];
    expect(segmentAnchor(segment({ geometry }), day, 0)).toEqual([7.2, 48.1]);
  });

  it('retombe sur le milieu des deux activités sans tracé', () => {
    expect(segmentAnchor(segment(), day, 0)).toEqual([7.5, 48.5]);
  });

  it('renvoie null quand le segment ne relie pas deux activités', () => {
    expect(segmentAnchor(segment(), day, 1)).toBeNull();
  });
});

describe('createTimeBubble', () => {
  it('affiche durée et distance arrondies pour un segment routé', () => {
    const el = createTimeBubble(segment({ routed: true }), 'Jour 1', null);
    expect(el.textContent).toBe('24 min · 20 km');
    expect(el.className).toContain('bg-trail');
    expect(el.tagName).toBe('DIV');
  });

  it('marque les estimations avec ~ et un style distinct', () => {
    const el = createTimeBubble(segment({ routed: false }), 'Jour 1', null);
    expect(el.textContent).toBe('~24 min · 20 km');
    expect(el.className).toContain('bg-snow');
  });

  it('devient un bouton cliquable quand un handler est fourni', () => {
    const onClick = vi.fn();
    const el = createTimeBubble(segment({ routed: true }), 'Jour 1', onClick);
    expect(el.tagName).toBe('BUTTON');
    el.dispatchEvent(new MouseEvent('click'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('porte un nom accessible et masque l’icône décorative', () => {
    const el = createTimeBubble(segment({ routed: true }), 'Jour 1 : 24 min', null);
    expect(el.getAttribute('aria-label')).toBe('Jour 1 : 24 min');
    expect(el.querySelector('span')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('affiche l’icône du mode de déplacement du segment', () => {
    for (const mode of ['car', 'foot', 'bike'] as const) {
      const el = createTimeBubble(segment({ mode }), 'x', null);
      expect(el.querySelector('svg')?.getAttribute('data-mode')).toBe(mode);
    }
  });
});

describe('flèches de sens du tracé', () => {
  it('suivent la ligne sans jamais se retourner, teintées à la couleur du tracé', async () => {
    const { routeArrowLayer, ROUTE_ARROW_ICON } = await import('../lib/mapStyles');
    const layer = routeArrowLayer('#A94E2B');
    expect(layer.type).toBe('symbol');
    expect(layer.source).toBe('route');
    expect(layer.layout?.['symbol-placement']).toBe('line');
    expect(layer.layout?.['icon-keep-upright']).toBe(false);
    expect(layer.layout?.['icon-rotation-alignment']).toBe('map');
    expect(layer.layout?.['icon-image']).toBe(ROUTE_ARROW_ICON);
    expect(layer.paint?.['icon-color']).toBe('#A94E2B');
  });
});

describe('createPlaceMarker', () => {
  it('charge tout de suite une vignette Wikimedia à la taille du marqueur', async () => {
    const { createPlaceMarker } = await import('../components/MapView');
    const el = createPlaceMarker(
      { name: 'Annecy', lat: 45.9, lng: 6.13, day: 1, kind: 'start' },
      '#000000',
      'https://thumb.wikimedia.org/wikipedia/commons/thumb/9/96/A.jpg/960px-A.jpg',
      'Voir les photos d’Annecy',
    );
    const img = el.querySelector('img');
    expect(img?.getAttribute('src')).toBe(
      'https://thumb.wikimedia.org/wikipedia/commons/thumb/9/96/A.jpg/330px-A.jpg',
    );
    expect(img?.getAttribute('loading')).toBe('eager');
  });
});
