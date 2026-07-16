import { create } from 'zustand';
import type { Trip, TripProposal } from '@triptic/shared';

interface TripState {
  /** Proposition sélectionnée parmi les 3 (avant sauvegarde). */
  selected: TripProposal | null;
  /** Trip persisté côté serveur (après sauvegarde). */
  saved: Trip | null;
  select: (proposal: TripProposal) => void;
  setSaved: (trip: Trip) => void;
  clear: () => void;
}

export const useTripStore = create<TripState>((set) => ({
  selected: null,
  saved: null,
  select: (proposal) => set({ selected: proposal, saved: null }),
  setSaved: (trip) => set({ saved: trip }),
  clear: () => set({ selected: null, saved: null }),
}));
