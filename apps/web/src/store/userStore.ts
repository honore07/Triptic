import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import type { PlanId } from '@triptic/shared';
import { track } from '../lib/analytics';
import { supabase } from '../lib/supabase';

interface UserState {
  plan: PlanId;
  remaining: number | null;
  paywallOpen: boolean;
  /** Session Supabase — null si déconnecté ou auth non configurée. */
  session: Session | null;
  /** Jeton d'accès courant (rafraîchi par supabase-js), lu par lib/api.ts. */
  accessToken: string | null;
  email: string | null;
  /** true = le serveur applique l'offre de lancement (tout ouvert). */
  launchOffer: boolean;
  setLaunchOffer: (launchOffer: boolean) => void;
  setPlan: (plan: PlanId) => void;
  setRemaining: (remaining: number) => void;
  openPaywall: () => void;
  closePaywall: () => void;
  setSession: (session: Session | null) => void;
}

export const useUserStore = create<UserState>((set) => ({
  plan: (localStorage.getItem('triptic-plan') as PlanId | null) ?? 'free',
  remaining: null,
  paywallOpen: false,
  session: null,
  accessToken: null,
  email: null,
  launchOffer: false,
  setLaunchOffer: (launchOffer) => set({ launchOffer }),
  setPlan: (plan) => {
    localStorage.setItem('triptic-plan', plan);
    set({ plan, paywallOpen: false });
  },
  setRemaining: (remaining) => set({ remaining }),
  openPaywall: () => {
    track('paywall_opened');
    set({ paywallOpen: true });
  },
  closePaywall: () => set({ paywallOpen: false }),
  setSession: (session) =>
    set({
      session,
      accessToken: session?.access_token ?? null,
      email: session?.user.email ?? null,
    }),
}));

// Session persistée par supabase-js (localStorage) + refresh automatique :
// le store reflète l'état, y compris au chargement de la page.
if (supabase) {
  void supabase.auth
    .getSession()
    .then(({ data }) => useUserStore.getState().setSession(data.session));
  supabase.auth.onAuthStateChange((_event, session) => {
    useUserStore.getState().setSession(session);
  });
}
