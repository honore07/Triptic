import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Backpack, Compass, MapPinPlus } from 'lucide-react';
import { LangSwitcher } from './components/LangSwitcher';
import { OnlineIndicator } from './components/OnlineIndicator';
import { PaywallModal } from './components/PaywallModal';
import { Contribute } from './pages/Contribute';
import { Explore } from './pages/Explore';
import { Home } from './pages/Home';
import { LegalAttributions } from './pages/LegalAttributions';
import { LegalTdm } from './pages/LegalTdm';
import { MyTrips } from './pages/MyTrips';
import { Plan } from './pages/Plan';
import { SavedTrip } from './pages/SavedTrip';
import { PublicTrip } from './pages/PublicTrip';
import { TripPage } from './pages/Trip';

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

export function App() {
  const { t } = useTranslation();
  return (
    <BrowserRouter>
      <OnlineIndicator />
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3">
        <Link to="/" className="font-display text-lg font-bold text-trail">
          TRIP<span className="text-summit">TIC</span>
        </Link>
        <nav className="flex items-center gap-4">
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
          <LangSwitcher />
        </nav>
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
        <Route path="/legal/attributions" element={<LegalAttributions />} />
        <Route path="/legal/tdm" element={<LegalTdm />} />
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
      </footer>
      <PaywallModal />
    </BrowserRouter>
  );
}
