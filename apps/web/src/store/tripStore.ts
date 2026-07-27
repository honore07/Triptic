import { create } from 'zustand';
import type { PlanId, Trip, TripDay, TripProposal } from '@triptic/shared';
import { recomputeTrip, type RecomputePayload } from '../lib/api';

interface TripState {
  /** Proposition sélectionnée parmi les 3 (avant sauvegarde). */
  selected: TripProposal | null;
  /** Trip persisté côté serveur (après sauvegarde). */
  saved: Trip | null;
  /** Pile d'annulation — chaque édition (manuelle ou chat) est réversible (3.1/3.2). */
  history: TripProposal[];
  /** Recalcul serveur en cours (segments/budget/CO₂). */
  recomputing: boolean;
  select: (proposal: TripProposal) => void;
  setSaved: (trip: Trip) => void;
  /**
   * Applique de nouveaux jours (édition manuelle ou conversationnelle) :
   * historique ↖, recalcul live serveur (routing + budget + CO₂), merge.
   */
  applyDays: (days: TripDay[], plan: PlanId) => Promise<void>;
  /** Merge direct d'un résultat déjà recalculé (édition conversationnelle). */
  applyRecomputed: (payload: RecomputePayload) => void;
  /** Snapshot avant édition conversationnelle (l'appelant merge ensuite). */
  pushHistory: () => void;
  undo: () => void;
  clear: () => void;
}

export const useTripStore = create<TripState>((set, get) => ({
  selected: null,
  saved: null,
  history: [],
  recomputing: false,

  select: (proposal) => set({ selected: proposal, saved: null, history: [] }),
  setSaved: (trip) => set({ saved: trip }),
  clear: () => set({ selected: null, saved: null, history: [], recomputing: false }),

  applyDays: async (days, plan) => {
    const current = get().selected;
    if (!current) return;
    // Optimiste : les jours changent tout de suite, les totaux suivent
    set({
      history: [...get().history, current],
      selected: { ...current, days },
      recomputing: true,
    });
    try {
      const payload = await recomputeTrip({ ...current, days }, plan);
      if (payload) get().applyRecomputed(payload);
    } finally {
      set({ recomputing: false });
    }
  },

  applyRecomputed: (payload) => {
    const current = get().selected;
    if (!current) return;
    set({
      selected: {
        ...current,
        days: payload.days,
        waypoints: payload.waypoints,
        distance_km: payload.distance_km,
        elevation_gain_m: payload.elevation_gain_m,
        daily_distance_km: payload.daily_distance_km,
        ...(payload.co2_kg !== undefined ? { co2_kg: payload.co2_kg } : {}),
        ...(payload.budget !== undefined ? { budget: payload.budget } : {}),
      },
    });
  },

  pushHistory: () => {
    const current = get().selected;
    if (current) set({ history: [...get().history, current] });
  },

  undo: () => {
    // Le snapshot contient déjà des totaux cohérents : restauration directe
    const history = get().history;
    const previous = history[history.length - 1];
    if (!previous) return;
    set({ selected: previous, history: history.slice(0, -1) });
  },
}));
