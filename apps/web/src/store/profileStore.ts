import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** Système d'unités d'affichage — le stockage reste toujours métrique. */
export type Units = 'metric' | 'imperial';

/**
 * Préférences durables (planche PL.14). Chacune a un effet réel : elles
 * partent en contraintes de génération, jamais des interrupteurs décoratifs.
 */
export interface Preferences {
  /** Prévenu quand la fenêtre météo se referme. */
  weather_alerts: boolean;
  /** Ne proposer que des zones de bivouac légales. */
  legal_bivouac: boolean;
  /** Nuits en autonomie complète — écarter les refuges. */
  avoid_refuges: boolean;
  /** Préparer la carte hors-ligne avant le départ. */
  offline_maps: boolean;
}

/**
 * Véhicule enregistré (planche PL.13). Les gabarits et réserves deviennent
 * des contraintes de tracé pour la génération.
 */
export interface Vehicle {
  name: string;
  /** Photo du véhicule (data URL carrée) — null = gravure par défaut. */
  photo: string | null;
  /** Hauteur hors-tout en mètres — décide des ponts bas praticables. */
  height_m: number;
  length_m: number;
  /** Poids total autorisé en charge, en tonnes. */
  weight_t: number;
  /** Consommation moyenne aux 100 km et capacité du réservoir. */
  consumption_l: number;
  tank_l: number;
  /** Réserve d'eau propre en litres — espace les points de service. */
  water_l: number;
  avoid_low_bridges: boolean;
  avoid_unpaved: boolean;
  official_areas_only: boolean;
  /** Un point de service au moins tous les N jours. */
  service_every_days: number;
}

export const DEFAULT_PREFERENCES: Preferences = {
  weather_alerts: true,
  legal_bivouac: true,
  avoid_refuges: false,
  offline_maps: true,
};

export const DEFAULT_VEHICLE: Vehicle = {
  name: '',
  photo: null,
  height_m: 2.55,
  length_m: 5.4,
  weight_t: 3.2,
  consumption_l: 9.4,
  tank_l: 75,
  water_l: 100,
  avoid_low_bridges: true,
  avoid_unpaved: true,
  official_areas_only: false,
  service_every_days: 3,
};

interface ProfileState {
  units: Units;
  preferences: Preferences;
  /**
   * Photo de profil du compte (data URL carrée). Elle reste dans le
   * navigateur : il n'y a pas de stockage d'images côté serveur.
   */
  avatar: string | null;
  /** null tant qu'aucun véhicule n'a été enregistré. */
  vehicle: Vehicle | null;
  setUnits: (units: Units) => void;
  setAvatar: (avatar: string | null) => void;
  setPreference: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  saveVehicle: (vehicle: Vehicle) => void;
  clearVehicle: () => void;
}

export const useProfileStore = create<ProfileState>()(
  persist(
    (set, get) => ({
      units: 'metric',
      preferences: DEFAULT_PREFERENCES,
      avatar: null,
      vehicle: null,
      setUnits: (units) => set({ units }),
      setAvatar: (avatar) => set({ avatar }),
      setPreference: (key, value) =>
        set({ preferences: { ...get().preferences, [key]: value } }),
      saveVehicle: (vehicle) => set({ vehicle }),
      clearVehicle: () => set({ vehicle: null }),
    }),
    { name: 'vire-profile', storage: createJSONStorage(() => localStorage) },
  ),
);

/** Une contrainte à traduire par l'appelant (le store ignore i18n). */
export interface ProfileConstraint {
  key: string;
  params?: Record<string, string | number>;
}

/**
 * Contraintes de tracé issues du profil et du véhicule. Elles rejoignent le
 * même canal `constraints[]` que celles de PL.05, que le moteur lit déjà.
 */
export function profileConstraints(): ProfileConstraint[] {
  const { preferences, vehicle } = useProfileStore.getState();
  const out: ProfileConstraint[] = [];
  if (preferences.legal_bivouac) out.push({ key: 'profil.pref_legal_bivouac' });
  if (preferences.avoid_refuges) out.push({ key: 'profil.pref_avoid_refuges' });
  if (!vehicle) return out;
  if (vehicle.avoid_low_bridges)
    out.push({ key: 'vehicule.c_low_bridges', params: { m: vehicle.height_m } });
  if (vehicle.avoid_unpaved) out.push({ key: 'vehicule.c_unpaved' });
  if (vehicle.official_areas_only) out.push({ key: 'vehicule.c_official' });
  if (vehicle.service_every_days > 0)
    out.push({ key: 'vehicule.c_service', params: { days: vehicle.service_every_days } });
  return out;
}
