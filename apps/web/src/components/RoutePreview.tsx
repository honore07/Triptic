import type { Waypoint } from '@triptic/shared';
import { MAP_COLORS } from '../lib/mapColors';

interface Props {
  waypoints: Waypoint[];
  className?: string;
  stroke?: string;
}

/**
 * Aperçu SVG du tracé (fallback léger sans token Mapbox, utilisable offline).
 * Projection équirectangulaire simple, suffisante à cette échelle.
 */
export function RoutePreview({ waypoints, className = '', stroke = MAP_COLORS.summit }: Props) {
  if (waypoints.length < 2) return null;
  const sorted = [...waypoints].sort((a, b) => a.day - b.day);
  const lats = sorted.map((w) => w.lat);
  const lngs = sorted.map((w) => w.lng);
  const pad = 0.1;
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const spanLat = Math.max(maxLat - minLat, 0.001);
  const spanLng = Math.max(maxLng - minLng, 0.001);

  const toX = (lng: number) => ((lng - minLng) / spanLng) * (1 - 2 * pad) * 100 + pad * 100;
  const toY = (lat: number) => (1 - (lat - minLat) / spanLat) * (1 - 2 * pad) * 100 + pad * 100;

  const points = sorted.map((w) => `${toX(w.lng).toFixed(1)},${toY(w.lat).toFixed(1)}`).join(' ');
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;

  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true" role="presentation">
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        className="route-draw"
      />
      <circle cx={toX(first.lng)} cy={toY(first.lat)} r="3" fill={MAP_COLORS.pine} />
      <circle
        cx={toX(last.lng)}
        cy={toY(last.lat)}
        r="3"
        fill={MAP_COLORS.storm}
        className="route-dot"
      />
    </svg>
  );
}
