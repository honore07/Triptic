/**
 * Prix carburant par pays (roadmap 1.3).
 *
 * Source visée : Bulletin pétrolier hebdomadaire de la Commission européenne
 * (gratuit). V1 : table statique datée, surchargée par variables d'env
 * (FUEL_PRICE_<PAYS>_<CARBURANT>, ex. FUEL_PRICE_FR_DIESEL=1.72) — le refresh
 * hebdo automatique depuis le bulletin (fichier XLSX) viendra avec le worker
 * BullMQ quand Redis sera installé sur le VPS.
 */

export type FuelType = 'petrol' | 'diesel';
export type CountryCode = 'FR' | 'DE' | 'CH' | 'IT' | 'AT' | 'ES';

/** €/L TTC — Bulletin pétrolier UE + OFS suisse, relevé juillet 2026 (approx). */
const DEFAULT_PRICES: Record<CountryCode, Record<FuelType, number>> = {
  FR: { petrol: 1.82, diesel: 1.72 },
  DE: { petrol: 1.78, diesel: 1.66 },
  CH: { petrol: 1.85, diesel: 1.9 },
  IT: { petrol: 1.79, diesel: 1.69 },
  AT: { petrol: 1.62, diesel: 1.58 },
  ES: { petrol: 1.58, diesel: 1.49 },
};

export function getFuelPrice(country: CountryCode, fuel: FuelType): number {
  const override = process.env[`FUEL_PRICE_${country}_${fuel.toUpperCase()}`];
  const parsed = override ? Number.parseFloat(override) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return DEFAULT_PRICES[country][fuel];
}

/**
 * Pays approximatif d'un point — bbox ordonnées, calées sur les régions
 * pilotes (Alsace + Alpes FR/CH/IT). Assumé imprécis en zone frontalière
 * (erreur = quelques centimes/L sur le budget carburant, jamais bloquant).
 * Défaut : FR (marché principal). La géo fine restera à PostGIS quand une
 * table pays sera nécessaire.
 */
export function countryForPoint(lat: number, lng: number): CountryCode {
  // Suisse : Valais/Oberland/Grisons — exclut Chamonix (lat < 45.95)
  if (lat >= 45.95 && lat <= 47.75 && lng >= 6.75 && lng <= 10.5) return 'CH';
  // Italie du Nord — exclut le sud-est français (Briançon/Nice : lng ≤ 7.6)
  if (lat >= 36.6 && lat <= 47.1 && lng >= 6.6 && lng <= 18.6 && !(lng <= 7.6 && lat >= 43.5))
    return 'IT';
  // Allemagne du Sud — lng ≥ 8.25 pour laisser l'Alsace en France
  if (lat >= 47.5 && lat <= 55.1 && lng >= 8.25 && lng <= 13.85) return 'DE';
  // Autriche
  if (lat >= 46.3 && lat <= 49.1 && lng >= 9.5 && lng <= 17.2) return 'AT';
  // Espagne
  if (lat >= 35.9 && lat <= 42.5 && lng >= -9.5 && lng <= 3.4) return 'ES';
  return 'FR';
}
