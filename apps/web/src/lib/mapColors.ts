/**
 * Couleurs de la charte v4 « VIRE — Alpine Heritage » pour les couches carte
 * (Mapbox GL `paint`, marqueurs, SVG RoutePreview).
 *
 * Dupliqué depuis styles.css — l'API Mapbox n'accepte pas les CSS vars.
 * Toute évolution de la palette doit être répercutée ici ET dans styles.css.
 */
export const MAP_COLORS = {
  summit: '#3A4A3F', // pin alpin — tracés route / marqueurs par défaut
  trail: '#111111', // encre carbone — marqueurs camp, tracés vélo
  gold: '#C9A24B', // laiton — tracé sur fond sombre (TripCard, photos)
  sky: '#DDD8CD', // papier ombré — surfaces accent
  pine: '#2E6B44', // succès — segments pied, départ, trailhead
  storm: '#8C2F26', // rouge fanion — marqueur d'arrivée
} as const;
