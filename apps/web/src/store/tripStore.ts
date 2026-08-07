import { create } from 'zustand';
import type { PlanId, Trip, TripDay, TripProposal } from '@triptic/shared';
import { recomputeTrip, saveTrip, updateTrip, type RecomputePayload } from '../lib/api';
import { useUserStore } from './userStore';

interface TripState {
  /** Proposition sélectionnée parmi les 3 (avant sauvegarde). */
  selected: TripProposal | null;
  /** Trip persisté côté serveur (après sauvegarde). */
  saved: Trip | null;
  /** Pile d'annulation — chaque édition (manuelle ou chat) est réversible (3.1/3.2). */
  history: TripProposal[];
  /** Recalcul serveur en cours (segments/budget/CO₂). */
  recomputing: boolean;
  /** Échec du dernier recalcul (même pattern que chatStore.error) — affiché par l'UI. */
  error: string | null;
  select: (proposal: TripProposal) => void;
  setSaved: (trip: Trip) => void;
  /** Hydrate le store depuis un trip persisté (page /trips/:id). */
  hydrate: (trip: Trip) => void;
  /**
   * Sauvegarde silencieuse en brouillon (déclenchée par select) : POST au
   * premier choix, PATCH ensuite — l'id serveur est conservé, pas de doublon.
   * Échec réseau : log dev uniquement, jamais bloquant pour l'UX.
   */
  autosaveDraft: () => Promise<void>;
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
  error: null,

  select: (proposal) => {
    const { selected: previous, saved: previousSaved } = get();
    // Re-sélection du même trip : on garde l'id serveur (PATCH, pas de doublon)
    const sameTrip =
      previousSaved !== null &&
      previous !== null &&
      previous.title === proposal.title &&
      previous.mode === proposal.mode;
    set({
      selected: proposal,
      saved: sameTrip ? previousSaved : null,
      history: [],
      error: null,
    });
    void get().autosaveDraft();
  },
  setSaved: (trip) => set({ saved: trip }),

  hydrate: (trip) => {
    // metadata = TripProposal moins waypoints/title/mode/days (cf. saveTrip)
    const proposal: TripProposal = {
      ...trip.metadata,
      title: trip.title,
      mode: trip.mode,
      waypoints: trip.waypoints,
      ...(trip.days && trip.days.length > 0 ? { days: trip.days } : {}),
    };
    set({ selected: proposal, saved: trip, history: [], recomputing: false, error: null });
  },

  autosaveDraft: async () => {
    const proposal = get().selected;
    if (!proposal) return;
    const plan = useUserStore.getState().plan;
    try {
      const saved = get().saved;
      if (saved) {
        const updated = await updateTrip(saved.id, proposal, plan);
        if (updated && get().selected === proposal) set({ saved: updated });
      } else {
        const trip = await saveTrip(proposal, plan, false, 'draft');
        // La sélection a pu changer pendant le POST : on n'associe jamais
        // l'id serveur à un autre trip que celui envoyé
        if (get().selected === proposal) set({ saved: trip });
      }
    } catch (error) {
      // Silencieux côté UX (le trip reste en mémoire) — log dev uniquement
      if (import.meta.env.DEV) console.warn('[triptic] autosave draft failed', error);
    }
  },
  clear: () =>
    set({ selected: null, saved: null, history: [], recomputing: false, error: null }),

  applyDays: async (days, plan) => {
    const current = get().selected;
    if (!current) return;
    // Optimiste : les jours changent tout de suite, les totaux suivent
    set({
      history: [...get().history, current],
      selected: { ...current, days },
      recomputing: true,
      error: null,
    });
    try {
      const payload = await recomputeTrip({ ...current, days }, plan);
      if (payload) get().applyRecomputed(payload);
    } catch {
      // Échec réseau du recalcul : l'édition locale reste, les totaux peuvent
      // être obsolètes — l'UI affiche l'erreur (règle qualité #2)
      set({ error: 'recompute_failed' });
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
