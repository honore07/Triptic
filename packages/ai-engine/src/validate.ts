import {
  haversineKm,
  type ShortlistPlace,
  type TripDay,
  type TripMode,
  type TripProposal,
  type SegmentMode,
} from '@triptic/shared';

/**
 * Agent correcteur — version calculée.
 *
 * Les critères de blocage sont ceux du prompt correcteur, mais ils portent
 * tous sur des valeurs déjà présentes dans le JSON généré : les vérifier avec
 * un modèle coûtait ~18 s par génération (deepseek-v4-pro raisonne longuement
 * pour produire un verdict de 27 caractères) et donnait un résultat non
 * reproductible. Ici c'est de l'arithmétique : même verdict, quelques
 * millisecondes, et deux exécutions sur le même trip donnent le même résultat.
 *
 * Principe conservé du prompt : on ne bloque QUE les erreurs critiques, celles
 * qui rendent un trip inutilisable sur le terrain. En cas de doute, on valide —
 * un trip perfectible reste valide. Les seuils sont donc volontairement hauts.
 */

/** Au-delà : la journée n'est pas réalisable, quel que soit le niveau. */
const MAX_DAILY_KM: Record<SegmentMode, number> = {
  foot: 35,
  bike: 160,
  car: 500,
};

/** Mode de déplacement par défaut quand un segment ne porte pas le sien. */
const TRIP_MODE_TO_SEGMENT: Record<TripMode, SegmentMode> = {
  trek: 'foot',
  bikepacking: 'bike',
  roadtrip: 'car',
};

const MAX_DAILY_ELEVATION_M = 2500;
/** Le seuil de dénivelé ne s'applique qu'aux profils peu sportifs. */
const MAX_LEVEL_FOR_ELEVATION_CHECK = 3;
/** Écart maximal entre une activité et le lieu réel qui porte le même nom. */
const MAX_PLACE_DRIFT_KM = 50;
/** Écart de durée au-delà duquel les 3 propositions ne se comparent plus. */
const MAX_DURATION_SPREAD_DAYS = 2;
/** Deux trips dont les barycentres sont plus éloignés ne sont pas la même envie. */
const MAX_CENTROID_SPREAD_KM = 400;
/** Le prompt d'origine plafonnait à 3 remarques : on garde ce contrat. */
const MAX_ISSUES = 3;

export interface ValidateOptions {
  /** Niveau physique déclaré (TripRequest) — pilote le seuil de dénivelé. */
  physicalLevel?: number | undefined;
  /** Lieux réels autour du tracé : sert à repérer les coordonnées inventées. */
  shortlist?: ShortlistPlace[] | undefined;
}

/** Normalise un nom de lieu pour comparer « Petit Ballon » et « petit-ballon ». */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    // Retire les diacritiques (bloc Unicode « combining marks ») :
    // « Château » et « chateau » doivent tomber sur la même clé.
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Distance parcourue dans la journée, par mode de déplacement. */
function dailyDistanceByMode(day: TripDay, fallback: SegmentMode): Map<SegmentMode, number> {
  const totals = new Map<SegmentMode, number>();
  for (const segment of day.segments ?? []) {
    const mode = segment.mode ?? fallback;
    totals.set(mode, (totals.get(mode) ?? 0) + (segment.distance_km ?? 0));
  }
  // Pas de segments (routing indisponible) : on retombe sur les activités.
  if (totals.size === 0) {
    const fromActivities = day.activities.reduce((sum, a) => sum + (a.distance_km ?? 0), 0);
    if (fromActivities > 0) totals.set(fallback, fromActivities);
  }
  return totals;
}

/** Dénivelé positif cumulé de la journée. */
function dailyElevation(day: TripDay): number {
  const fromSegments = (day.segments ?? []).reduce((s, seg) => s + (seg.elevation_gain_m ?? 0), 0);
  if (fromSegments > 0) return fromSegments;
  return day.activities.reduce((s, a) => s + (a.elevation_gain_m ?? 0), 0);
}

/** Barycentre des points d'un trip — sert à comparer les 3 propositions. */
function centroid(trip: TripProposal): { lat: number; lng: number } | null {
  const points = (trip.days ?? []).flatMap((d) => d.activities.map((a) => ({ lat: a.lat, lng: a.lng })));
  const all = points.length > 0 ? points : trip.waypoints.map((w) => ({ lat: w.lat, lng: w.lng }));
  if (all.length === 0) return null;
  return {
    lat: all.reduce((s, p) => s + p.lat, 0) / all.length,
    lng: all.reduce((s, p) => s + p.lng, 0) / all.length,
  };
}

/** Journées infaisables : distance ou dénivelé hors de tout réalisme. */
function checkDays(trip: TripProposal, opts: ValidateOptions, prefix = ''): string[] {
  const issues: string[] = [];
  const fallbackMode = TRIP_MODE_TO_SEGMENT[trip.mode] ?? 'car';
  const level = opts.physicalLevel;

  for (const day of trip.days ?? []) {
    for (const [mode, km] of dailyDistanceByMode(day, fallbackMode)) {
      const max = MAX_DAILY_KM[mode];
      if (km > max) {
        issues.push(
          `${prefix}jour ${day.day} : ${Math.round(km)} km en ${LABEL[mode]}, au-delà du réalisable (${max} km).`,
        );
      }
    }
    if (level !== undefined && level <= MAX_LEVEL_FOR_ELEVATION_CHECK) {
      const gain = dailyElevation(day);
      if (gain > MAX_DAILY_ELEVATION_M) {
        issues.push(
          `${prefix}jour ${day.day} : ${Math.round(gain)} m de dénivelé pour un niveau ${level}.`,
        );
      }
    }
  }
  return issues;
}

const LABEL: Record<SegmentMode, string> = { foot: 'marche', bike: 'vélo', car: 'voiture' };

/**
 * Coordonnées inventées : quand un lieu réel de la base porte exactement le
 * même nom mais se trouve à plus de 50 km, c'est que le modèle a placé le
 * point au hasard. On ne conclut QUE sur une correspondance de nom exacte —
 * sans correspondance, on ne dit rien plutôt que de risquer un faux positif.
 */
function checkAnchoring(trip: TripProposal, shortlist: ShortlistPlace[], prefix = ''): string[] {
  if (shortlist.length === 0) return [];
  const byName = new Map<string, ShortlistPlace[]>();
  for (const place of shortlist) {
    const key = normalizeName(place.name);
    if (!key) continue;
    const bucket = byName.get(key);
    if (bucket) bucket.push(place);
    else byName.set(key, [place]);
  }

  const issues: string[] = [];
  for (const day of trip.days ?? []) {
    for (const activity of day.activities) {
      const matches = byName.get(normalizeName(activity.title));
      if (!matches || matches.length === 0) continue;
      // Homonymes : on retient le plus proche — s'il reste trop loin, l'écart est réel.
      const nearest = Math.min(...matches.map((p) => haversineKm(activity, p)));
      if (nearest > MAX_PLACE_DRIFT_KM) {
        issues.push(
          `${prefix}« ${activity.title} » est placé à ${Math.round(nearest)} km du lieu réel.`,
        );
      }
    }
  }
  return issues;
}

/** Les 3 propositions doivent rester comparables : même envie, variantes proches. */
function checkComparability(trips: TripProposal[]): string[] {
  if (trips.length < 2) return [];
  const issues: string[] = [];

  const modes = new Set(trips.map((t) => t.mode));
  if (modes.size > 1) {
    issues.push(`Les propositions n'ont pas le même mode (${[...modes].join(', ')}).`);
  }

  const durations = trips.map((t) => t.duration_days);
  const spread = Math.max(...durations) - Math.min(...durations);
  if (spread > MAX_DURATION_SPREAD_DAYS) {
    issues.push(`Les durées s'écartent de ${spread} jours (maximum ${MAX_DURATION_SPREAD_DAYS}).`);
  }

  const centroids = trips.map(centroid).filter((c): c is { lat: number; lng: number } => c !== null);
  for (let i = 0; i < centroids.length; i += 1) {
    for (let j = i + 1; j < centroids.length; j += 1) {
      const apart = haversineKm(centroids[i]!, centroids[j]!);
      if (apart > MAX_CENTROID_SPREAD_KM) {
        issues.push(`Deux propositions sont éloignées de ${Math.round(apart)} km : ce ne sont pas les mêmes vacances.`);
        return issues.slice(0, MAX_ISSUES);
      }
    }
  }
  return issues;
}

/**
 * Valide les 3 propositions. Retourne la liste des erreurs critiques —
 * vide = trips validés.
 */
export function validateTrips(trips: TripProposal[], opts: ValidateOptions = {}): string[] {
  const issues = [
    ...checkComparability(trips),
    ...trips.flatMap((t) => checkDays(t, opts, `${t.title} — `)),
    ...trips.flatMap((t) => checkAnchoring(t, opts.shortlist ?? [], `${t.title} — `)),
  ];
  return issues.slice(0, MAX_ISSUES);
}

/**
 * Valide les jours d'un trip édité (une seule proposition) : mêmes règles,
 * sans le critère de comparabilité qui n'a pas de sens ici.
 */
export function validateDays(
  days: TripDay[],
  mode: TripMode,
  opts: ValidateOptions = {},
): string[] {
  const asTrip = { title: 'Trip', mode, days, waypoints: [] } as unknown as TripProposal;
  return [...checkDays(asTrip, opts), ...checkAnchoring(asTrip, opts.shortlist ?? [])].slice(
    0,
    MAX_ISSUES,
  );
}
