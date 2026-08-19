/**
 * Couleurs de la charte v3 « Acrylique » pour les couches carte (Mapbox GL
 * `paint`, marqueurs, SVG RoutePreview).
 *
 * Dupliqué depuis styles.css — l'API Mapbox n'accepte pas les CSS vars.
 * Toute évolution de la palette doit être répercutée ici ET dans styles.css.
 */
export const MAP_COLORS = {
  summit: '#C8922A', // ocre doré — tracés route / marqueurs par défaut
  trail: '#2C1810', // brun profond — marqueurs camp
  gold: '#E4B04A', // ocre clair — tracé sur fond sombre (TripCard, photos)
  sky: '#C7DCEA', // bleu ciel peint — surfaces accent
  pine: '#2B7A4B', // succès — segments pied/vélo, départ, trailhead
  storm: '#9B2D42', // bordeaux — marqueur d'arrivée
} as const;
