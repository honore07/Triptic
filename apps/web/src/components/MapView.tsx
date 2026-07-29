import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { TripDay, Waypoint } from '@triptic/shared';
import { MAP_COLORS } from '../lib/mapColors';
import { RoutePreview } from './RoutePreview';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN as string | undefined;
const hasToken = Boolean(MAPBOX_TOKEN && !MAPBOX_TOKEN.startsWith('pk.xxx'));

interface Props {
  waypoints: Waypoint[];
  /** Jours structurés (0.1) : active les tracés routés + la synchro jour. */
  days?: TripDay[] | undefined;
  /** Jour sélectionné (cartes-étapes 2.2) — la carte se recentre dessus. */
  selectedDay?: number | null | undefined;
  /** Clic sur un marqueur → remonte le jour à la page (synchro inverse). */
  onSelectDay?: ((day: number) => void) | undefined;
}

/** Géométrie d'un jour : segments routés bout à bout (2.1). */
function dayCoordinates(day: TripDay): [number, number][] {
  const coords: [number, number][] = [];
  for (const segment of day.segments ?? []) {
    if (segment.geometry) coords.push(...segment.geometry);
  }
  if (coords.length === 0) {
    for (const activity of day.activities) coords.push([activity.lng, activity.lat]);
  }
  return coords;
}

/**
 * Carte du trip : Mapbox GL si un token est configuré (affichage uniquement —
 * jamais de stockage de tuiles), sinon aperçu SVG offline.
 * Avec des segments routés (GraphHopper) : tracé réel, couleur par mode
 * (voiture copper, pied/vélo pine pointillé) ; sans routing : trait droit
 * pointillé historique.
 */
export function MapView({ waypoints, days, selectedDay, onSelectDay }: Props) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import('mapbox-gl').Map | null>(null);

  useEffect(() => {
    if (!hasToken || !containerRef.current || waypoints.length < 2) return;
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
      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: 'mapbox://styles/mapbox/outdoors-v12',
        bounds,
        fitBoundsOptions: { padding: 48 },
      });
      mapRef.current = map;
      map.on('load', () => {
        const segments = (days ?? []).flatMap((d) => d.segments ?? []);
        const routed = segments.filter((s) => s.geometry && s.geometry.length > 1);

        if (routed.length > 0) {
          // Tracés réels GraphHopper — un feature par segment, stylé par mode
          map.addSource('route', {
            type: 'geojson',
            data: {
              type: 'FeatureCollection',
              features: routed.map((s) => ({
                type: 'Feature' as const,
                properties: { mode: s.mode },
                geometry: { type: 'LineString' as const, coordinates: s.geometry! },
              })),
            },
          });
          map.addLayer({
            id: 'route-car',
            type: 'line',
            source: 'route',
            filter: ['==', ['get', 'mode'], 'car'],
            paint: { 'line-color': MAP_COLORS.summit, 'line-width': 4, 'line-opacity': 0.9 },
          });
          map.addLayer({
            id: 'route-trail',
            type: 'line',
            source: 'route',
            filter: ['!=', ['get', 'mode'], 'car'],
            paint: {
              'line-color': MAP_COLORS.pine,
              'line-width': 3,
              'line-dasharray': [0.5, 1.5],
            },
          });
        } else {
          // Fallback historique : trait droit pointillé entre waypoints
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
            paint: { 'line-color': MAP_COLORS.summit, 'line-width': 3, 'line-dasharray': [0.1, 2] },
          });
        }

        for (const w of sorted) {
          const color =
            w.kind === 'start'
              ? MAP_COLORS.pine
              : w.kind === 'end'
                ? MAP_COLORS.storm
                : w.kind === 'camp'
                  ? MAP_COLORS.trail
                  : w.kind === 'trailhead'
                    ? MAP_COLORS.pine
                    : MAP_COLORS.summit;
          const marker = new mapboxgl.Marker({ color })
            .setLngLat([w.lng, w.lat])
            .setPopup(new mapboxgl.Popup({ offset: 24 }).setText(`${w.name} (J${w.day})`))
            .addTo(map);
          if (onSelectDay) {
            marker.getElement().addEventListener('click', () => onSelectDay(w.day));
            marker.getElement().style.cursor = 'pointer';
          }
        }
      });
    });

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // onSelectDay volontairement hors deps : callback stable attendu
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waypoints, days]);

  // Synchro cartes-étapes → carte : recentrage sur le jour sélectionné (2.2)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || selectedDay == null) return;
    const day = days?.find((d) => d.day === selectedDay);
    const coords = day
      ? dayCoordinates(day)
      : waypoints.filter((w) => w.day === selectedDay).map((w) => [w.lng, w.lat] as [number, number]);
    if (coords.length === 0) return;
    void import('mapbox-gl').then(({ default: mapboxgl }) => {
      const bounds = coords.reduce(
        (b, c) => b.extend(c),
        new mapboxgl.LngLatBounds(coords[0]!, coords[0]!),
      );
      map.fitBounds(bounds, { padding: 64, duration: 600, maxZoom: 13 });
    });
  }, [selectedDay, days, waypoints]);

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
