import type { TripDay, Waypoint } from '@triptic/shared';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Génère un fichier GPX 1.1 à partir des waypoints d'un trip.
 * Les waypoints nommés sont exportés en <wpt>. Le tracé <trk> utilise la
 * géométrie ROUTÉE des segments (GraphHopper) quand elle existe — un
 * <trkseg> par jour — sinon repli sur la ligne droite entre waypoints.
 * <desc> volontairement neutre (« Day N ») : le GPX est lu par des appareils
 * dont la langue est inconnue.
 */
export function buildGpx(title: string, waypoints: Waypoint[], days?: TripDay[]): string {
  const sorted = [...waypoints].sort((a, b) => a.day - b.day);
  const wpts = sorted
    .map(
      (w) =>
        `  <wpt lat="${w.lat}" lon="${w.lng}">\n    <name>${escapeXml(w.name)}</name>\n    <desc>${escapeXml(`Day ${w.day}${w.note ? ` — ${w.note}` : ''}`)}</desc>\n  </wpt>`,
    )
    .join('\n');

  const routedSegs = (days ?? [])
    .filter((d) => d.segments?.some((s) => s.geometry && s.geometry.length >= 2))
    .map((d) => {
      const pts = (d.segments ?? [])
        .flatMap((s) => s.geometry ?? [])
        .map(([lng, lat]) => `      <trkpt lat="${lat}" lon="${lng}"></trkpt>`)
        .join('\n');
      return `    <trkseg>\n${pts}\n    </trkseg>`;
    });

  const track =
    routedSegs.length > 0
      ? routedSegs.join('\n')
      : `    <trkseg>\n${sorted
          .map((w) => `      <trkpt lat="${w.lat}" lon="${w.lng}"></trkpt>`)
          .join('\n')}\n    </trkseg>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="TRIPTIC" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${escapeXml(title)}</name>
  </metadata>
${wpts}
  <trk>
    <name>${escapeXml(title)}</name>
${track}
  </trk>
</gpx>
`;
}
