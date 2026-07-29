/**
 * Couleurs de la charte v2 pour les couches carte (Mapbox GL `paint`,
 * marqueurs, SVG RoutePreview).
 *
 * Dupliqué depuis styles.css — l'API Mapbox n'accepte pas les CSS vars.
 * Toute évolution de la palette doit être répercutée ici ET dans styles.css.
 */
export const MAP_COLORS = {
  summit: '#C86341', // Rosy Copper — tracés route / marqueurs par défaut
  trail: '#1E1E24', // Shadow Grey — marqueurs camp
  gold: '#FAC05E', // Sunflower Gold — tracé sur fond sombre (TripCard)
  sky: '#CDE6F5', // Pale Sky — surfaces accent
  pine: '#1A8A4A', // succès — segments pied/vélo, départ, trailhead
  storm: '#C03030', // erreur — marqueur d'arrivée
} as const;
