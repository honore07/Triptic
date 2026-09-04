import { Suspense, lazy, useEffect, type ReactNode } from 'react';
import { BrowserRouter, Link, Route, Routes, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Backpack, Compass, LogOut, MapPinPlus, PartyPopper, UserRound } from 'lucide-react';
import { trackPageview } from './lib/analytics';
import { fetchMe } from './lib/api';
import { supabase } from './lib/supabase';
import { useUserStore } from './store/userStore';
import { LangSwitcher } from './components/LangSwitcher';
import { LogoVire } from './components/LogoVire';
import { MiseAJour } from './components/MiseAJour';
import { OnlineIndicator } from './components/OnlineIndicator';
import { PaywallModal } from './components/PaywallModal';
import { Home } from './pages/Home';
import { Plan } from './pages/Plan';

/*
 * Boucle cœur (accueil, génération) dans le bundle initial ; tout le reste
 * arrive à la demande — la carte Mapbox (1,8 Mo) ne se charge déjà que
 * quand une carte se rend. Une page qui échoue à charger (réseau coupé en
 * cours de route) tombe sur l'écran hors ligne du service worker.
 */
const Contribute = lazy(() => import('./pages/Contribute').then((m) => ({ default: m.Contribute })));
const Explore = lazy(() => import('./pages/Explore').then((m) => ({ default: m.Explore })));
const LegalAttributions = lazy(() =>
  import('./pages/LegalAttributions').then((m) => ({ default: m.LegalAttributions })),
);
const LegalPage = lazy(() => import('./pages/LegalPage').then((m) => ({ default: m.LegalPage })));
const LegalTdm = lazy(() => import('./pages/LegalTdm').then((m) => ({ default: m.LegalTdm })));
const MyTrips = lazy(() => import('./pages/MyTrips').then((m) => ({ default: m.MyTrips })));
const SavedTrip = lazy(() => import('./pages/SavedTrip').then((m) => ({ default: m.SavedTrip })));
const Profil = lazy(() => import('./pages/Profil').then((m) => ({ default: m.Profil })));
const PublicTrip = lazy(() => import('./pages/PublicTrip').then((m) => ({ default: m.PublicTrip })));
const TripPage = lazy(() => import('./pages/Trip').then((m) => ({ default: m.TripPage })));
const Vehicule = lazy(() => import('./pages/Vehicule').then((m) => ({ default: m.Vehicule })));
const AuthPage = lazy(() => import('./pages/Auth').then((m) => ({ default: m.AuthPage })));

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

/**
 * Chaque page se pose sur la planche — un fondu remonté court, relancé à
 * chaque changement de route (la clé force le remontage). Rien de plus :
 * l'animation est éditoriale, pas cinématographique.
 */
function PageTurn({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <div key={pathname} className="page-turn flex flex-1 flex-col">
      {children}
    </div>
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
      <MiseAJour />
      <OnlineIndicator />
      <LaunchOfferBanner />
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3">
        <Link to="/" className="flex items-center gap-2.5 text-trail">
          {/* La marque VIRE — la gravure elle-même, à une taille qui lui
           * laisse le détail : sous ~32 px son trait fin vire au gris. */}
          <LogoVire size={42} />
          <span className="flex flex-col gap-0.5 leading-none">
            <span className="font-display text-xl font-bold uppercase tracking-[0.18em]">
              VIRE
            </span>
            <span className="label-mono hidden text-fog sm:block">{t('app.tagline')}</span>
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
          <Link
            to="/profil"
            className="flex items-center gap-1 text-sm font-semibold text-ridge hover:text-copper-deep"
          >
            <UserRound size={15} aria-hidden="true" />
            <span className="hidden sm:inline">{t('profil.nav')}</span>
            <span className="sr-only sm:hidden">{t('profil.nav')}</span>
          </Link>
          <AccountNav />
        </nav>
        <LangSwitcher />
      </header>
      <PageTurn>
      {/* Le temps qu'une page arrive : la planche reste vide, jamais un spinner */}
      <Suspense fallback={<main className="min-h-[50vh]" aria-busy="true" />}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/plan" element={<Plan />} />
        <Route path="/trip" element={<TripPage />} />
        <Route path="/trip/:slug" element={<PublicTrip />} />
        <Route path="/trips" element={<MyTrips />} />
        <Route path="/trips/:id" element={<SavedTrip />} />
        <Route path="/contribute" element={<Contribute />} />
        <Route path="/explore" element={<Explore />} />
        <Route path="/profil" element={<Profil />} />
        <Route path="/vehicule" element={<Vehicule />} />
        <Route path="/login" element={<AuthPage />} />
        <Route path="/legal/attributions" element={<LegalAttributions />} />
        <Route path="/legal/tdm" element={<LegalTdm />} />
        <Route path="/legal/mentions" element={<LegalPage section="mentions" />} />
        <Route path="/legal/privacy" element={<LegalPage section="privacy" />} />
        <Route path="/legal/terms" element={<LegalPage section="terms" />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      </Suspense>
      </PageTurn>
      {/* Bande papier sous le pied de page : l'accueil pose une photo plein
       * écran derrière tout, et ces liens sont en encre sombre. Sans fond
       * opaque ils deviendraient illisibles sur le bas assombri. Ailleurs,
       * la bande se confond avec le papier de la page. */}
      <footer className="mt-auto border-t border-mist/30 bg-cloud/92">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-center gap-x-5 px-4 py-4">
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
        </div>
      </footer>
      <PaywallModal />
    </BrowserRouter>
  );
}
