import type { ActivityType, TripDay, Waypoint } from './types.js';

/**
 * Compatibilité ascendante (roadmap 0.1) : les waypoints[] historiques
 * (carte, GPX, tracé PostGIS) restent dérivables de la structure jours →
 * activités. Premier point = start, dernier = end.
 */
const WAYPOINT_KIND_BY_ACTIVITY: Record<ActivityType, Waypoint['kind']> = {
  drive: 'stage',
  hike: 'poi',
  visit: 'poi',
  meal: 'poi',
  camp: 'camp',
  rest: 'stage',
};

export function deriveWaypointsFromDays(days: TripDay[]): Waypoint[] {
  const waypoints: Waypoint[] = [];
  for (const day of [...days].sort((a, b) => a.day - b.day)) {
    for (const activity of day.activities) {
      waypoints.push({
        name: activity.title,
        lat: activity.lat,
        lng: activity.lng,
        day: day.day,
        kind: WAYPOINT_KIND_BY_ACTIVITY[activity.type],
        ...(activity.description !== undefined ? { note: activity.description } : {}),
      });
    }
  }
  const first = waypoints[0];
  const last = waypoints[waypoints.length - 1];
  if (first) first.kind = 'start';
  if (last && waypoints.length > 1) last.kind = 'end';
  return waypoints;
}
