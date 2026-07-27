import { FOOD_KINDS, type PlaceKind, type ShortlistPlace, type TimeOfDay, type TripActivity, type TripDay } from '@triptic/shared';

/** Résultat « search this area » (4.2) : lieu + temps de trajet éventuel. */
export interface ExplorePlace extends ShortlistPlace {
  id: string;
  travel_min?: number | undefined;
}

/**
 * Puces de filtre rapide de l'écran Explore — chaque puce est liée à des
 * kinds STRICTS de la base places (pas de texte re-parsé, même principe
 * que l'onboarding 1.1). L'IA (parse-filters) affine avec les mêmes kinds.
 */
export const EXPLORE_CHIPS: { key: string; kinds: PlaceKind[] }[] = [
  { key: 'nature', kinds: ['peak', 'lake', 'waterfall', 'gorge', 'viewpoint', 'glacier', 'pass'] },
  { key: 'culture', kinds: ['castle', 'museum', 'village', 'attraction'] },
  { key: 'food', kinds: [...FOOD_KINDS] },
  { key: 'night', kinds: ['camp', 'refuge'] },
];

/** Un résultat ajouté au programme devient une activité du jour (0.1). */
export function activityFromPlace(
  place: ExplorePlace,
  timeOfDay: TimeOfDay = 'afternoon',
): TripActivity {
  const type = FOOD_KINDS.includes(place.kind)
    ? 'meal'
    : place.kind === 'camp' || place.kind === 'refuge'
      ? 'camp'
      : 'visit';
  return {
    type,
    time_of_day: timeOfDay,
    title: place.name,
    lat: place.lat,
    lng: place.lng,
    ...(place.summary ? { description: place.summary } : {}),
    place_id: place.id,
  };
}

/** Ajout en 1 tap : insère l'activité dans le jour ciblé (nuit en dernier). */
export function addActivityToDay(
  days: TripDay[],
  dayNumber: number,
  activity: TripActivity,
): TripDay[] {
  return days.map((day) => {
    if (day.day !== dayNumber) return day;
    const activities = [...day.activities];
    // La nuit reste en fin de journée : on insère avant l'activité "camp"
    const campIndex = activities.findIndex((a) => a.type === 'camp');
    if (activity.type !== 'camp' && campIndex !== -1) {
      activities.splice(campIndex, 0, activity);
    } else {
      activities.push(activity);
    }
    return { ...day, activities };
  });
}
