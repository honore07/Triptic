/** Helpers Wikidata purs (testables sans réseau). */

/**
 * Notoriété recalculée depuis le nombre de sitelinks (articles Wikipédia
 * dans différentes langues) — meilleur proxy gratuit de la notoriété réelle.
 * Un lieu avec wikidata mais peu de sitelinks reste une pépite (30).
 */
export function notorietyFromSitelinks(sitelinks: number): number {
  if (sitelinks >= 15) return 90;
  if (sitelinks >= 8) return 75;
  if (sitelinks >= 4) return 60;
  if (sitelinks >= 2) return 45;
  return 30;
}

/** Parse un littéral WKT SPARQL "Point(lon lat)" → {lat, lng}. */
export function parseWktPoint(wkt: string): { lat: number; lng: number } | null {
  const match = /^Point\(([-\d.]+) ([-\d.]+)\)$/i.exec(wkt.trim());
  if (!match) return null;
  const lng = Number.parseFloat(match[1] as string);
  const lat = Number.parseFloat(match[2] as string);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

/** Découpe une liste en lots de n (l'API wbgetentities accepte 50 ids max). */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
