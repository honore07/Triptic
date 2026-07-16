import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { Waypoint } from '@triptic/shared';
import { RoutePreview } from './RoutePreview';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN as string | undefined;
const hasToken = Boolean(MAPBOX_TOKEN && !MAPBOX_TOKEN.startsWith('pk.xxx'));

/**
 * Carte du trip : Mapbox GL si un token est configuré,
 * sinon aperçu SVG du tracé (fonctionne offline, zéro dépendance réseau).
 */
export function MapView({ waypoints }: { waypoints: Waypoint[] }) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasToken || !containerRef.current || waypoints.length < 2) return;
    let map: import('mapbox-gl').Map | undefined;
    let cancelled = false;

    void import('mapbox-gl').then(({ default: mapboxgl }) => {
      if (cancelled || !containerRef.current) return;
      mapboxgl.accessToken = MAPBOX_TOKEN!;
      const sorted = [...waypoints].sort((a, b) => a.day - b.day);
      const bounds = sorted.reduce(
        (b, w) => b.extend([w.lng, w.lat]),
        new mapboxgl.LngLatBounds(
          [sorted[0]!.lng, sorted[0]!.lat],
          [sorted[0]!.lng, sorted[0]!.lat],
        ),
      );
      map = new mapboxgl.Map({
        container: containerRef.current,
        style: 'mapbox://styles/mapbox/outdoors-v12',
        bounds,
        fitBoundsOptions: { padding: 48 },
      });
      map.on('load', () => {
        if (!map) return;
        map.addSource('route', {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: sorted.map((w) => [w.lng, w.lat]),
            },
          },
        });
        map.addLayer({
          id: 'route',
          type: 'line',
          source: 'route',
          paint: { 'line-color': '#1A6BDB', 'line-width': 3, 'line-dasharray': [0.1, 2] },
        });
        for (const w of sorted) {
          new mapboxgl.Marker({ color: w.kind === 'start' ? '#1A8A4A' : w.kind === 'end' ? '#C03030' : '#1A6BDB' })
            .setLngLat([w.lng, w.lat])
            .setPopup(new mapboxgl.Popup({ offset: 24 }).setText(`${w.name} (J${w.day})`))
            .addTo(map);
        }
      });
    });

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [waypoints]);

  if (!hasToken) {
    return (
      <div className="relative overflow-hidden rounded-trip border border-mist bg-snow">
        <RoutePreview waypoints={waypoints} className="h-64 w-full sm:h-80" />
        <p className="border-t border-mist px-3 py-2 text-xs text-fog">{t('map.no_token')}</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-64 w-full overflow-hidden rounded-trip sm:h-96"
      role="application"
      aria-label={t('map.preview')}
    />
  );
}
