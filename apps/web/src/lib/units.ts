import type { Units } from '../store/profileStore';

/**
 * Conversion d'affichage seulement — les données restent métriques partout
 * (base, API, GPX). Seul le rendu change.
 */
const KM_PER_MILE = 1.609344;
const M_PER_FOOT = 0.3048;

/** Distance : « 240 km » ou « 149 mi ». */
export function formatDistance(km: number, units: Units): string {
  if (!Number.isFinite(km)) return '—';
  return units === 'imperial'
    ? `${Math.round(km / KM_PER_MILE)} mi`
    : `${Math.round(km)} km`;
}

/** Dénivelé ou altitude : « 2 140 m » ou « 7 021 ft ». */
export function formatElevation(m: number, units: Units): string {
  if (!Number.isFinite(m)) return '—';
  return units === 'imperial'
    ? `${Math.round(m / M_PER_FOOT)} ft`
    : `${Math.round(m)} m`;
}
