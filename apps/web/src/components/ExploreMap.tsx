import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { ExploreBbox } from '../lib/api';
import type { ExplorePlace } from '../lib/explore';
import { MAP_COLORS } from '../lib/mapColors';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN as string | undefined;
const hasToken = Boolean(MAPBOX_TOKEN && !MAPBOX_TOKEN.startsWith('pk.xxx'));

/** Centre par défaut : Vosges (périmètre pilote). */
const DEFAULT_CENTER: [number, number] = [7.1, 48.05];

interface Props {
  results: ExplorePlace[];
  /** Tracé de boucle rando à dessiner (5.2) — null pour effacer. */
  trace?: [number, number][] | null;
  /** Recentrage demandé (géoloc « autour de moi »). */
  center: [number, number] | null;
  onBoundsChange: (bbox: ExploreBbox) => void;
}

/**
 * Carte navigable de l'écran Explore (4.2) : remonte la zone visible à
 * chaque déplacement (bouton « chercher dans cette zone ») et affiche les
 * résultats. Mapbox = affichage uniquement. Sans token : message d'info,
 * l'écran reste utilisable via la zone par défaut.
 */
export function ExploreMap({ results, trace = null, center, onBoundsChange }: Props) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import('mapbox-gl').Map | null>(null);
  const markersRef = useRef<import('mapbox-gl').Marker[]>([]);
  const onBoundsRef = useRef(onBoundsChange);
  onBoundsRef.current = onBoundsChange;

  useEffect(() => {
    if (!hasToken || !containerRef.current) return;
    let cancelled = false;
    void import('mapbox-gl').then(({ default: mapboxgl }) => {
      if (cancelled || !containerRef.current) return;
      mapboxgl.accessToken = MAPBOX_TOKEN!;
      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: 'mapbox://styles/mapbox/outdoors-v12',
        center: DEFAULT_CENTER,
        zoom: 9,
      });
      mapRef.current = map;
      const report = () => {
        const b = map.getBounds();
        if (!b) return;
        onBoundsRef.current({
          south: b.getSouth(),
          west: b.getWest(),
          north: b.getNorth(),
          east: b.getEast(),
        });
      };
      map.on('load', report);
      map.on('moveend', report);
    });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Marqueurs des résultats (remplacés à chaque recherche)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    void import('mapbox-gl').then(({ default: mapboxgl }) => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = results.map((place) =>
        new mapboxgl.Marker({ color: MAP_COLORS.summit })
          .setLngLat([place.lng, place.lat])
          .setPopup(new mapboxgl.Popup({ offset: 24 }).setText(place.name))
          .addTo(map),
      );
    });
  }, [results]);

  // Recentrage géoloc
  useEffect(() => {
    if (center) mapRef.current?.flyTo({ center, zoom: 12, duration: 800 });
  }, [center]);

  // Tracé de boucle rando sélectionnée (pointillé pine, comme les segments trail)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    if (map.getLayer('trail-trace')) map.removeLayer('trail-trace');
    if (map.getSource('trail-trace')) map.removeSource('trail-trace');
    if (!trace || trace.length < 2) return;
    map.addSource('trail-trace', {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: trace },
      },
    });
    map.addLayer({
      id: 'trail-trace',
      type: 'line',
      source: 'trail-trace',
      paint: { 'line-color': MAP_COLORS.pine, 'line-width': 3, 'line-dasharray': [0.5, 1.5] },
    });
    void import('mapbox-gl').then(({ default: mapboxgl }) => {
      const bounds = trace.reduce(
        (b, c) => b.extend(c),
        new mapboxgl.LngLatBounds(trace[0]!, trace[0]!),
      );
      map.fitBounds(bounds, { padding: 48, duration: 600 });
    });
  }, [trace]);

  if (!hasToken) {
    return (
      <div className="flex h-64 items-center justify-center rounded-trip border border-mist bg-terrain px-6 text-center text-sm text-ridge sm:h-80">
        {t('map.no_token')}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-64 w-full overflow-hidden rounded-trip sm:h-96"
      role="application"
      aria-label={t('explore.map_label')}
    />
  );
}
