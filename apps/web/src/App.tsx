import { useEffect } from 'react';
import { BrowserRouter, Link, Route, Routes, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Backpack, Compass, LogOut, MapPinPlus, PartyPopper, UserRound } from 'lucide-react';
import { trackPageview } from './lib/analytics';
import { fetchMe } from './lib/api';
import { supabase } from './lib/supabase';
import { useUserStore } from './store/userStore';
import { LangSwitcher } from './components/LangSwitcher';
import { OnlineIndicator } from './components/OnlineIndicator';
import { PaywallModal } from './components/PaywallModal';
import { Contribute } from './pages/Contribute';
import { Explore } from './pages/Explore';
import { Home } from './pages/Home';
import { LegalAttributions } from './pages/LegalAttributions';
import { LegalPage } from './pages/LegalPage';
import { LegalTdm } from './pages/LegalTdm';
import { MyTrips } from './pages/MyTrips';
import { Plan } from './pages/Plan';
import { SavedTrip } from './pages/SavedTrip';
import { PublicTrip } from './pages/PublicTrip';
import { TripPage } from './pages/Trip';
import { AuthPage } from './pages/Auth';

/**
 * Aligne plan/quota/offre de lancement sur le serveur à chaque changement de
 * session (le localStorage ne fait foi qu'en mode démo sans auth).
 */
function useServerPlan() {
  const accessToken = useUserStore((s) => s.accessToken);
  useEffect(() => {
    if (!supabase) return;
    void fetchMe().then((me) => {
      const store = useUserStore.getState();
      if (!me) return;
      store.setLaunchOffer(me.launch_offer);
      if (me.authenticated) {
        store.setPlan(me.plan);
        if (me.remaining !== null) store.setRemaining(me.remaining);
      } else {
        store.setPlan('free');
        // Le client croit avoir une session mais le serveur dit non (jeton
        // invalide même après rafraîchissement) : purger l'état pour que
        // l'en-tête arrête d'afficher « connecté » à tort — l'utilisateur
        // voit alors le bouton Compte et peut se reconnecter.
        if (store.accessToken) {
          store.setSession(null);
          void supabase?.auth.signOut().catch(() => undefined);
        }
      }
    });
  }, [accessToken]);
}

/** Bandeau « offre de lancement » — tout ouvert tant que le serveur l'applique. */
function LaunchOfferBanner() {
  const { t } = useTranslation();
  const launchOffer = useUserStore((s) => s.launchOffer);
  if (!launchOffer) return null;
  return (
    <p className="mx-auto flex w-full max-w-5xl items-center gap-2 px-4 py-1.5 text-xs font-semibold text-copper-deep">
      <PartyPopper size={14} aria-hidden="true" />
      {t('auth.launch_offer_banner')}
    </p>
  );
}

/** Lien Compte (déconnecté) ou bouton Déconnexion (connecté). */
function AccountNav() {
  const { t } = useTranslation();
  const email = useUserStore((s) => s.email);
  if (!supabase) return null;
  const client = supabase;
  if (email) {
    return (
      <button
        type="button"
        onClick={() => void client.auth.signOut()}
        title={email}
        className="flex min-h-11 items-center gap-1 text-sm font-semibold text-ridge hover:text-copper-deep"
      >
        <LogOut size={15} aria-hidden="true" />
        <span className="hidden sm:inline">{t('auth.logout')}</span>
        <span className="sr-only sm:hidden">{t('auth.logout')}</span>
      </button>
    );
  }
  return (
    <Link
      to="/login"
      className="flex min-h-11 items-center gap-1 text-sm font-semibold text-ridge hover:text-copper-deep"
    >
      <UserRound size={15} aria-hidden="true" />
      <span className="hidden sm:inline">{t('auth.login_nav')}</span>
      <span className="sr-only sm:hidden">{t('auth.login_nav')}</span>
    </Link>
  );
}

/** Page 404 (route catch-all) — message + retour accueil, jamais de page blanche. */
function NotFound() {
  const { t } = useTranslation();
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 text-center">
      <p className="text-ridge">{t('app.page_not_found')}</p>
      <Link to="/" className="mt-4 inline-block font-semibold text-copper-deep underline">
        {t('app.back_home')}
      </Link>
    </main>
  );
}

/** Pageview SPA à chaque navigation — chemin seul (jamais query ni hash). */
function Pageviews() {
  const { pathname } = useLocation();
  useEffect(() => {
    trackPageview(pathname);
  }, [pathname]);
  return null;
}

export function App() {
  const { t } = useTranslation();
  useServerPlan();
  return (
    <BrowserRouter>
      <Pageviews />
      <OnlineIndicator />
      <LaunchOfferBanner />
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3">
        <Link
          to="/"
          className="flex flex-col gap-0.5 font-display text-2xl font-bold italic leading-none text-trail [text-shadow:2px_2px_6px_rgba(200,146,42,.3)]"
        >
          <span>
            Trip<span className="text-copper-deep">tic</span>
          </span>
          <span className="label-mono hidden not-italic text-fog sm:block">
            {t('app.tagline')}
          </span>
        </Link>
        <nav className="nav-dock flex items-center gap-4">
          <Link
            to="/trips"
            className="flex items-center gap-1 text-sm font-semibold text-ridge hover:text-copper-deep"
          >
            <Backpack size={15} aria-hidden="true" />
            <span className="hidden sm:inline">{t('my_trips.nav')}</span>
            <span className="sr-only sm:hidden">{t('my_trips.nav')}</span>
          </Link>
          <Link
            to="/explore"
            className="flex items-center gap-1 text-sm font-semibold text-ridge hover:text-copper-deep"
          >
            <Compass size={15} aria-hidden="true" />
            <span className="hidden sm:inline">{t('explore.nav')}</span>
            <span className="sr-only sm:hidden">{t('explore.nav')}</span>
          </Link>
          <Link
            to="/contribute"
            className="flex items-center gap-1 text-sm font-semibold text-ridge hover:text-copper-deep"
          >
            <MapPinPlus size={15} aria-hidden="true" />
            <span className="hidden sm:inline">{t('places.nav')}</span>
            <span className="sr-only sm:hidden">{t('places.nav')}</span>
          </Link>
          <AccountNav />
        </nav>
        <LangSwitcher />
      </header>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/plan" element={<Plan />} />
        <Route path="/trip" element={<TripPage />} />
        <Route path="/trip/:slug" element={<PublicTrip />} />
        <Route path="/trips" element={<MyTrips />} />
        <Route path="/trips/:id" element={<SavedTrip />} />
        <Route path="/contribute" element={<Contribute />} />
        <Route path="/explore" element={<Explore />} />
        <Route path="/login" element={<AuthPage />} />
        <Route path="/legal/attributions" element={<LegalAttributions />} />
        <Route path="/legal/tdm" element={<LegalTdm />} />
        <Route path="/legal/mentions" element={<LegalPage section="mentions" />} />
        <Route path="/legal/privacy" element={<LegalPage section="privacy" />} />
        <Route path="/legal/terms" element={<LegalPage section="terms" />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <footer className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-center gap-x-5 px-4 py-4">
        <Link
          to="/legal/attributions"
          className="inline-flex min-h-11 items-center text-xs text-ridge underline-offset-2 hover:text-copper-deep hover:underline"
        >
          {t('legal.attributions_nav')}
        </Link>
        <Link
          to="/legal/tdm"
          className="inline-flex min-h-11 items-center text-xs text-ridge underline-offset-2 hover:text-copper-deep hover:underline"
        >
          {t('legal.tdm_nav')}
        </Link>
        <Link
          to="/legal/mentions"
          className="inline-flex min-h-11 items-center text-xs text-ridge underline-offset-2 hover:text-copper-deep hover:underline"
        >
          {t('legal.mentions_nav')}
        </Link>
        <Link
          to="/legal/privacy"
          className="inline-flex min-h-11 items-center text-xs text-ridge underline-offset-2 hover:text-copper-deep hover:underline"
        >
          {t('legal.privacy_nav')}
        </Link>
        <Link
          to="/legal/terms"
          className="inline-flex min-h-11 items-center text-xs text-ridge underline-offset-2 hover:text-copper-deep hover:underline"
        >
          {t('legal.terms_nav')}
        </Link>
      </footer>
      <PaywallModal />
    </BrowserRouter>
  );
}
