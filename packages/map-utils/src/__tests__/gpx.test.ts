import { describe, expect, it } from 'vitest';
import { buildGpx } from '../gpx.js';
import type { Waypoint } from '@triptic/shared';

const WAYPOINTS: Waypoint[] = [
  { name: 'Grand Ballon', lat: 47.9014, lng: 7.0994, day: 3, kind: 'end' },
  { name: 'Col de la Schlucht', lat: 48.0631, lng: 7.0209, day: 1, kind: 'start' },
];

describe('buildGpx', () => {
  it('produces valid GPX with sorted waypoints and a track', () => {
    const gpx = buildGpx('Crêtes des Vosges', WAYPOINTS);
    expect(gpx).toContain('<gpx version="1.1"');
    expect(gpx).toContain('<name>Crêtes des Vosges</name>');
    // Trié par jour : la Schlucht (jour 1) avant le Grand Ballon (jour 3)
    expect(gpx.indexOf('Col de la Schlucht')).toBeLessThan(gpx.indexOf('Grand Ballon'));
    expect((gpx.match(/<trkpt /g) ?? []).length).toBe(2);
  });

  it('escapes XML special characters', () => {
    const gpx = buildGpx('Trip <fun> & "wild"', [
      { name: "Lac d'Alfeld <nord>", lat: 47.8, lng: 6.9, day: 1, kind: 'start' },
    ]);
    expect(gpx).toContain('Trip &lt;fun&gt; &amp; &quot;wild&quot;');
    expect(gpx).toContain('Lac d&apos;Alfeld &lt;nord&gt;');
    expect(gpx).not.toMatch(/<name>[^<]*<fun>/);
  });
});
