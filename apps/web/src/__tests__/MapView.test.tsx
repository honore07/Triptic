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

  it('porte un nom accessible et masque la pastille décorative', () => {
    const el = createTimeBubble(segment({ routed: true }), 'Jour 1 : 24 min', null);
    expect(el.getAttribute('aria-label')).toBe('Jour 1 : 24 min');
    expect(el.querySelector('span')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('colore la pastille selon le mode', () => {
    const car = createTimeBubble(segment({ mode: 'car' }), 'x', null);
    const foot = createTimeBubble(segment({ mode: 'foot' }), 'x', null);
    expect(car.querySelector('span')?.className).toContain('bg-summit');
    expect(foot.querySelector('span')?.className).toContain('bg-pine');
  });
});
