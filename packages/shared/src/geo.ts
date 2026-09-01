/**
 * Géométrie de base, partagée serveur ↔ moteur IA.
 *
 * La règle du projet est de faire le géospatial en PostGIS. Elle vaut pour les
 * REQUÊTES (recherche par rayon, corridor, intersection) : c'est la base qui
 * indexe et qui sait. Ici il s'agit de comparer deux points déjà en mémoire,
 * pendant une génération — un aller-retour SQL coûterait plus cher que le
 * calcul lui-même, et le moteur IA n'a de toute façon pas accès à la base.
 */

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Distance grand-cercle entre deux points, en kilomètres. */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(s));
}
