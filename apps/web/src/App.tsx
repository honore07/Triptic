import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { LangSwitcher } from './components/LangSwitcher';
import { OnlineIndicator } from './components/OnlineIndicator';
import { PaywallModal } from './components/PaywallModal';
import { Home } from './pages/Home';
import { Plan } from './pages/Plan';
import { PublicTrip } from './pages/PublicTrip';
import { TripPage } from './pages/Trip';

export function App() {
  return (
    <BrowserRouter>
      <OnlineIndicator />
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3">
        <Link to="/" className="font-display text-lg font-bold text-trail">
          TRIP<span className="text-summit">TIC</span>
        </Link>
        <LangSwitcher />
      </header>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/plan" element={<Plan />} />
        <Route path="/trip" element={<TripPage />} />
        <Route path="/trip/:slug" element={<PublicTrip />} />
      </Routes>
      <PaywallModal />
    </BrowserRouter>
  );
}
