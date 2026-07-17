import { create } from 'zustand';
import type { PlanId } from '@triptic/shared';

interface UserState {
  plan: PlanId;
  remaining: number | null;
  paywallOpen: boolean;
  setPlan: (plan: PlanId) => void;
  setRemaining: (remaining: number) => void;
  openPaywall: () => void;
  closePaywall: () => void;
}

export const useUserStore = create<UserState>((set) => ({
  plan: (localStorage.getItem('triptic-plan') as PlanId | null) ?? 'free',
  remaining: null,
  paywallOpen: false,
  setPlan: (plan) => {
    localStorage.setItem('triptic-plan', plan);
    set({ plan, paywallOpen: false });
  },
  setRemaining: (remaining) => set({ remaining }),
  openPaywall: () => set({ paywallOpen: true }),
  closePaywall: () => set({ paywallOpen: false }),
}));
