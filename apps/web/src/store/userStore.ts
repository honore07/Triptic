import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import type { PlanId } from '@triptic/shared';
import { track } from '../lib/analytics';
import { recoveryLink, supabase } from '../lib/supabase';

/** Réinitialisation entamée : elle survit à un rechargement ou à un onglet refermé. */
const RECOVERY_KEY = 'vire-password-reset';

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
  /** Session ouverte par un lien « mot de passe oublié » : choisir le nouveau mot de passe d'abord. */
  recovery: boolean;
  /** true une fois la session initiale lue par supabase-js, liens d'email compris. */
  authReady: boolean;
  setLaunchOffer: (launchOffer: boolean) => void;
  setPlan: (plan: PlanId) => void;
  setRemaining: (remaining: number) => void;
  openPaywall: () => void;
  closePaywall: () => void;
  setSession: (session: Session | null) => void;
  setRecovery: (recovery: boolean) => void;
}

export const useUserStore = create<UserState>((set) => ({
  plan: (localStorage.getItem('triptic-plan') as PlanId | null) ?? 'free',
  remaining: null,
  paywallOpen: false,
  session: null,
  accessToken: null,
  email: null,
  launchOffer: false,
  recovery: recoveryLink || localStorage.getItem(RECOVERY_KEY) === 'pending',
  authReady: !supabase,
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
  setRecovery: (recovery) => {
    if (recovery) localStorage.setItem(RECOVERY_KEY, 'pending');
    else localStorage.removeItem(RECOVERY_KEY);
    set({ recovery });
  },
}));

// Session persistée par supabase-js (localStorage) + refresh automatique :
// le store reflète l'état, y compris au chargement de la page.
if (supabase) {
  if (recoveryLink) useUserStore.getState().setRecovery(true);
  void supabase.auth
    .getSession()
    .then(({ data }) => {
      const store = useUserStore.getState();
      store.setSession(data.session);
      // Lien expiré, ou réinitialisation abandonnée puis déconnectée : plus rien à changer.
      if (!data.session && store.recovery) store.setRecovery(false);
    })
    .catch(() => undefined)
    .finally(() => useUserStore.setState({ authReady: true }));
  supabase.auth.onAuthStateChange((event, session) => {
    const store = useUserStore.getState();
    if (event === 'PASSWORD_RECOVERY') store.setRecovery(true);
    if (event === 'SIGNED_OUT') store.setRecovery(false);
    store.setSession(session);
  });
}
