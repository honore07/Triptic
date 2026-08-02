import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TripDay, TripSegment, Waypoint } from '@triptic/shared';
import { fetchPlacePhotos, type PlacePhoto } from '../lib/api';
import { MAP_COLORS } from '../lib/mapColors';
import { PlaceCarousel } from './PlaceCarousel';
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

/** Position de la bulle : milieu du tracé routé, sinon milieu des 2 activités. */
export function segmentAnchor(
  segment: TripSegment,
  day: TripDay,
  index: number,
): [number, number] | null {
  const geometry = segment.geometry;
  if (geometry && geometry.length > 1) return geometry[Math.floor(geometry.length / 2)]!;
  const from = day.activities[index];
  const to = day.activities[index + 1];
  if (!from || !to) return null;
  return [(from.lng + to.lng) / 2, (from.lat + to.lat) / 2];
}

/**
 * Bulle de temps de trajet posée sur le tracé (repère GPS familier).
 * Segment routé : fond plein. Estimation (hors zone de routage) : fond clair
 * et préfixe « ~ » — une estimation ne doit jamais se lire comme une mesure.
 */
export function createTimeBubble(
  segment: TripSegment,
  label: string,
  onClick: (() => void) | null,
): HTMLElement {
  const el = document.createElement(onClick ? 'button' : 'div');
  if (onClick) {
    (el as HTMLButtonElement).type = 'button';
    el.addEventListener('click', onClick);
  }
  el.className = [
    'flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 font-body',
    'text-[11px] font-semibold shadow-md transition-transform duration-150',
    onClick ? 'cursor-pointer hover:-translate-y-0.5' : '',
    segment.routed ? 'bg-trail text-snow' : 'border border-mist bg-snow text-ridge',
  ].join(' ');
  el.setAttribute('aria-label', label);

  const dot = document.createElement('span');
  dot.className = `inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
    segment.mode === 'car' ? 'bg-summit' : 'bg-pine'
  }`;
  dot.setAttribute('aria-hidden', 'true');
  el.appendChild(dot);

  const text = document.createElement('span');
  text.textContent = `${segment.routed ? '' : '~'}${Math.round(segment.duration_min)} min · ${Math.round(
    segment.distance_km,
  )} km`;
  el.appendChild(text);
  return el;
}

/** Couleur du marqueur selon le type de point. */
export function markerColor(kind: Waypoint['kind']): string {
  if (kind === 'start' || kind === 'trailhead') return MAP_COLORS.pine;
  if (kind === 'end') return MAP_COLORS.storm;
  if (kind === 'camp') return MAP_COLORS.trail;
  return MAP_COLORS.summit;
}

/**
 * Marqueur de lieu : vignette photo ronde quand le jour en a une (repère
 * visuel immédiat), sinon pastille pleine. Cliquable → carrousel du lieu.
 */
export function createPlaceMarker(
  waypoint: Waypoint,
  color: string,
  thumbUrl: string | undefined,
  label: string,
): HTMLElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.setAttribute('aria-label', label);
  el.className =
    'block h-11 w-11 overflow-hidden rounded-full border-[3px] bg-snow shadow-md transition-transform duration-150 hover:scale-110 cursor-pointer';
  el.style.borderColor = color;

  if (thumbUrl) {
    const img = document.createElement('img');
    img.src = thumbUrl;
    img.alt = '';
    img.loading = 'lazy';
    img.className = 'h-full w-full object-cover';
    el.appendChild(img);
  } else {
    el.style.backgroundColor = color;
  }
  return el;
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
  const bubblesRef = useRef<{ day: number; element: HTMLElement }[]>([]);
  // Lu à la création des bulles (effet carte hors deps de selectedDay)
  const selectedDayRef = useRef(selectedDay);
  selectedDayRef.current = selectedDay;
  const [gallery, setGallery] = useState<{
    place: string;
    photos: PlacePhoto[];
    loading: boolean;
  } | null>(null);
  // Une réponse tardive ne doit pas écraser un lieu ouvert entre-temps
  const galleryReqRef = useRef(0);

  const openCarousel = useCallback((waypoint: Waypoint) => {
    const req = ++galleryReqRef.current;
    setGallery({ place: waypoint.name, photos: [], loading: true });
    void fetchPlacePhotos(waypoint.name).then((photos) => {
      if (galleryReqRef.current !== req) return;
      setGallery({ place: waypoint.name, photos, loading: false });
    });
  }, []);

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

        // Temps de trajet lisibles directement sur le tracé
        bubblesRef.current = [];
        for (const d of days ?? []) {
          (d.segments ?? []).forEach((segment, index) => {
            const anchor = segmentAnchor(segment, d, index);
            if (!anchor) return;
            const label = t('map.segment_time', {
              day: d.day,
              minutes: Math.round(segment.duration_min),
              km: Math.round(segment.distance_km),
            });
            const element = createTimeBubble(
              segment,
              segment.routed ? label : `${label} — ${t('days.estimated')}`,
              onSelectDay ? () => onSelectDay(d.day) : null,
            );
            const active = selectedDayRef.current == null || selectedDayRef.current === d.day;
            element.style.display = active ? '' : 'none';
            new mapboxgl.Marker({ element }).setLngLat(anchor).addTo(map);
            bubblesRef.current.push({ day: d.day, element });
          });
        }

        for (const w of sorted) {
          const color = markerColor(w.kind);
          // Vignette photo si le jour en a une (réutilisée, aucun appel réseau
          // de plus) ; sinon pastille pleine de la couleur du type de point.
          const thumb = days?.find((d) => d.day === w.day)?.photo_url;
          const element = createPlaceMarker(w, color, thumb, t('carousel.open', { place: w.name }));
          element.addEventListener('click', () => {
            onSelectDay?.(w.day);
            openCarousel(w);
          });
          new mapboxgl.Marker({ element }).setLngLat([w.lng, w.lat]).addTo(map);
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

  // Un jour sélectionné : on ne garde que ses bulles (sinon la carte sature)
  useEffect(() => {
    for (const bubble of bubblesRef.current) {
      bubble.element.style.display =
        selectedDay == null || bubble.day === selectedDay ? '' : 'none';
    }
  }, [selectedDay, days]);

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
    <div className="relative">
      <div
        ref={containerRef}
        className="h-64 w-full overflow-hidden rounded-trip sm:h-96"
        role="application"
        aria-label={t('map.preview')}
      />
      {gallery && (
        <PlaceCarousel
          title={gallery.place}
          photos={gallery.photos}
          loading={gallery.loading}
          onClose={() => setGallery(null)}
        />
      )}
    </div>
  );
}
