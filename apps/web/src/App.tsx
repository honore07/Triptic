import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MapPinPlus } from 'lucide-react';
import { LangSwitcher } from './components/LangSwitcher';
import { OnlineIndicator } from './components/OnlineIndicator';
import { PaywallModal } from './components/PaywallModal';
import { Contribute } from './pages/Contribute';
import { Home } from './pages/Home';
import { Plan } from './pages/Plan';
import { PublicTrip } from './pages/PublicTrip';
import { TripPage } from './pages/Trip';

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
        <Route path="/contribute" element={<Contribute />} />
      </Routes>
      <PaywallModal />
    </BrowserRouter>
  );
}
