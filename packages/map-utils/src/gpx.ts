import type { Waypoint } from '@triptic/shared';

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
 * Les waypoints nommés sont exportés en <wpt>, le tracé complet en <trk>.
 */
export function buildGpx(title: string, waypoints: Waypoint[]): string {
  const sorted = [...waypoints].sort((a, b) => a.day - b.day);
  const wpts = sorted
    .map(
      (w) =>
        `  <wpt lat="${w.lat}" lon="${w.lng}">\n    <name>${escapeXml(w.name)}</name>\n    <desc>${escapeXml(`Jour ${w.day}${w.note ? ` — ${w.note}` : ''}`)}</desc>\n  </wpt>`,
    )
    .join('\n');
  const trkpts = sorted
    .map((w) => `      <trkpt lat="${w.lat}" lon="${w.lng}"></trkpt>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="TRIPTIC" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${escapeXml(title)}</name>
  </metadata>
${wpts}
  <trk>
    <name>${escapeXml(title)}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>
`;
}
