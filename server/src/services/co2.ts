/**
 * Estimation CO₂ (roadmap 1.2) — facteurs d'émission ADEME Base Carbone
 * (Licence Ouverte Etalab, usage commercial OK), approche well-to-wheel.
 * Facteurs statiques versionnés dans le code (ils évoluent à l'année) :
 * essence ≈ 2,31 kg CO₂e/L, diesel ≈ 2,68 kg CO₂e/L.
 * Rando et vélo : 0. Affichage arrondi, jamais plus de 2 chiffres significatifs.
 */
import type { Vehicle } from '@triptic/shared';
import type { FuelType } from './fuelPrices.js';

/** kg CO₂e par litre, well-to-wheel — Source : ADEME Base Carbone. */
export const CO2_KG_PER_LITRE: Record<FuelType, number> = {
  petrol: 2.31,
  diesel: 2.68,
};

/** Consommation moyenne L/100 km par type de véhicule (défauts éditables plus tard). */
export const CONSUMPTION_L_PER_100KM: Record<Exclude<Vehicle, 'none'>, number> = {
  car: 7,
  van: 9.5,
  moto: 5,
};

/** Carburant typique par véhicule (van = diesel, voiture/moto = essence). */
export const FUEL_BY_VEHICLE: Record<Exclude<Vehicle, 'none'>, FuelType> = {
  car: 'petrol',
  van: 'diesel',
  moto: 'petrol',
};

export interface DriveEstimate {
  litres: number;
  co2_kg: number;
}

/** Litres et CO₂e d'un trajet routier. Véhicule absent/none → van par défaut
 * (cœur de cible TRIPTIC) pour ne jamais afficher 0 sur un road trip. */
export function estimateDrive(distanceKm: number, vehicle: Vehicle | undefined): DriveEstimate {
  const v = !vehicle || vehicle === 'none' ? 'van' : vehicle;
  const litres = (distanceKm * CONSUMPTION_L_PER_100KM[v]) / 100;
  return { litres, co2_kg: litres * CO2_KG_PER_LITRE[FUEL_BY_VEHICLE[v]] };
}

/** Arrondi « honnête » : 2 chiffres significatifs max (≈ 48, ≈ 120, ≈ 1300). */
export function roundCo2(kg: number): number {
  if (kg <= 0) return 0;
  const magnitude = 10 ** Math.max(0, Math.floor(Math.log10(kg)) - 1);
  return Math.round(kg / magnitude) * magnitude;
}
