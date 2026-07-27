/**
 * Parseurs de traces GPX/KML → coordonnées GeoJSON [lng, lat][] (roadmap 0.4).
 * Utilisés par l'import DATAtourisme (pièces jointes média des WalkingTour/
 * CyclingTour) — préfigure le stockage des tracés rando de la phase 5.
 * Parseurs par regex volontairement simples : on ne lit que les points de
 * tracé, pas les métadonnées.
 */

/** Points <trkpt>/<rtept> d'un GPX, dans l'ordre du fichier. */
export function parseGpxTrace(xml: string): [number, number][] {
  const coords: [number, number][] = [];
  const re = /<(?:trkpt|rtept)\b[^>]*\blat="(-?[\d.]+)"[^>]*\blon="(-?[\d.]+)"|<(?:trkpt|rtept)\b[^>]*\blon="(-?[\d.]+)"[^>]*\blat="(-?[\d.]+)"/g;
  for (const m of xml.matchAll(re)) {
    const lat = Number.parseFloat(m[1] ?? m[4] ?? '');
    const lon = Number.parseFloat(m[2] ?? m[3] ?? '');
    if (Number.isFinite(lat) && Number.isFinite(lon)) coords.push([lon, lat]);
  }
  return coords;
}

/** Points du premier bloc <coordinates> d'un KML ("lon,lat[,ele] lon,lat…"). */
export function parseKmlTrace(xml: string): [number, number][] {
  const block = xml.match(/<coordinates>([\s\S]*?)<\/coordinates>/)?.[1];
  if (!block) return [];
  const coords: [number, number][] = [];
  for (const token of block.trim().split(/\s+/)) {
    const [lonStr, latStr] = token.split(',');
    const lon = Number.parseFloat(lonStr ?? '');
    const lat = Number.parseFloat(latStr ?? '');
    if (Number.isFinite(lon) && Number.isFinite(lat)) coords.push([lon, lat]);
  }
  return coords;
}

/** Choisit le parseur selon l'URL ou le contenu. Retourne [] si illisible. */
export function parseTrace(content: string, url: string): [number, number][] {
  if (/\.kml(\?|$)/i.test(url) || content.includes('<kml')) return parseKmlTrace(content);
  return parseGpxTrace(content);
}
