/**
 * Saison déduite des dates du trip (onboarding : les dates de départ/retour
 * pilotent la saison ET la faisabilité des activités — cols fermés l'hiver,
 * baignade l'été, névés au printemps…).
 * Hémisphère nord (périmètre pilote Alsace/Alpes) — bascule au 21 du mois.
 */

export type Season = 'winter' | 'spring' | 'summer' | 'autumn';

export function seasonForDate(isoDate: string): Season | null {
  const date = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  // Mois "pleins" + bascule aux solstices/équinoxes (~21)
  if (month === 12) return day >= 21 ? 'winter' : 'autumn';
  if (month <= 2) return 'winter';
  if (month === 3) return day >= 21 ? 'spring' : 'winter';
  if (month <= 5) return 'spring';
  if (month === 6) return day >= 21 ? 'summer' : 'spring';
  if (month <= 8) return 'summer';
  if (month === 9) return day >= 21 ? 'autumn' : 'summer';
  if (month <= 11) return 'autumn';
  return null;
}

/** Nombre de jours du trip, bornes incluses (départ = jour 1). */
export function tripDurationDays(startDate: string, endDate: string): number | null {
  const start = new Date(`${startDate}T12:00:00Z`).getTime();
  const end = new Date(`${endDate}T12:00:00Z`).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
  return Math.round((end - start) / 86_400_000) + 1;
}

/** Date ISO du jour N du trip (jour 1 = date de départ). */
export function dateForTripDay(startDate: string, dayNumber: number): string | null {
  const start = new Date(`${startDate}T12:00:00Z`);
  if (Number.isNaN(start.getTime())) return null;
  start.setUTCDate(start.getUTCDate() + (dayNumber - 1));
  return start.toISOString().slice(0, 10);
}
