import { describe, expect, it } from 'vitest';
import { parseGpxTrace, parseKmlTrace, parseTrace } from '../traces.js';

const GPX = `<?xml version="1.0"?>
<gpx version="1.1"><trk><trkseg>
  <trkpt lat="48.0631" lon="7.0209"><ele>1139</ele></trkpt>
  <trkpt lon="7.0086" lat="48.0403"></trkpt>
  <rtept lat="47.9014" lon="7.0994"/>
</trkseg></trk></gpx>`;

const KML = `<?xml version="1.0"?>
<kml><Placemark><LineString><coordinates>
  7.0209,48.0631,1139 7.0086,48.0403 7.0994,47.9014,1424
</coordinates></LineString></Placemark></kml>`;

describe('parseGpxTrace', () => {
  it('extrait trkpt et rtept en ordre GeoJSON [lng, lat], attributs dans les deux sens', () => {
    expect(parseGpxTrace(GPX)).toEqual([
      [7.0209, 48.0631],
      [7.0086, 48.0403],
      [7.0994, 47.9014],
    ]);
  });

  it('retourne [] sur un contenu illisible', () => {
    expect(parseGpxTrace('<html>404</html>')).toEqual([]);
  });
});

describe('parseKmlTrace', () => {
  it('extrait le bloc coordinates (lon,lat[,ele])', () => {
    expect(parseKmlTrace(KML)).toEqual([
      [7.0209, 48.0631],
      [7.0086, 48.0403],
      [7.0994, 47.9014],
    ]);
  });
});

describe('parseTrace', () => {
  it('choisit le parseur selon l’extension ou le contenu', () => {
    expect(parseTrace(KML, 'https://x/tour.kml')).toHaveLength(3);
    expect(parseTrace(KML, 'https://x/tour?format=xml')).toHaveLength(3); // <kml détecté
    expect(parseTrace(GPX, 'https://x/tour.gpx')).toHaveLength(3);
  });
});
