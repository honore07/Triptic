import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Trip } from '@triptic/shared';
import { SavedTrip } from '../pages/SavedTrip';
import { useTripStore } from '../store/tripStore';
import { useUserStore } from '../store/userStore';
import { setLang } from '../lib/i18n';
import * as api from '../lib/api';

vi.mock('../lib/api', () => ({
  fetchTrip: vi.fn(),
  saveTrip: vi.fn(),
  updateTrip: vi.fn(),
  recomputeTrip: vi.fn(),
}));

// Composants lourds (Mapbox, fetch météo, SSE) hors du périmètre de ces tests
vi.mock('../components/MapView', () => ({ MapView: () => <div data-testid="map" /> }));
vi.mock('../components/WeatherStrip', () => ({ WeatherStrip: () => null }));
vi.mock('../components/TripEditChat', () => ({ TripEditChat: () => null }));
vi.mock('../components/GPXExportButton', () => ({ GPXExportButton: () => null }));

const fetchTrip = vi.mocked(api.fetchTrip);

const trip: Trip = {
  id: 't1',
  user_id: 'u1',
  title: 'Boucle des Vosges',
  slug: null,
  is_public: false,
  mode: 'roadtrip',
  status: 'draft',
  metadata: {
    mode: 'roadtrip',
    duration_days: 3,
    distance_km: 240,
    elevation_gain_m: 3200,
    difficulty: 'medium',
    ambiance: 'sauvage',
    summary: 'Trois jours entre cols et lacs.',
    daily_distance_km: 80,
    photo_keywords: ['vosges'],
  },
  waypoints: [
    { name: 'Colmar', lat: 48.08, lng: 7.36, day: 1, kind: 'start' },
    { name: 'Munster', lat: 48.04, lng: 7.14, day: 3, kind: 'end' },
  ],
  days: null,
  cover_photo: null,
  created_at: '2026-07-29T00:00:00Z',
  updated_at: '2026-07-29T00:00:00Z',
};

function renderAt(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/trips/${id}`]}>
      <Routes>
        <Route path="/trips/:id" element={<SavedTrip />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('SavedTrip (/trips/:id)', () => {
  beforeEach(() => {
    setLang('fr');
    fetchTrip.mockReset();
    useUserStore.setState({ plan: 'free' });
    useTripStore.setState({
      selected: null,
      saved: null,
      history: [],
      recomputing: false,
      error: null,
    });
  });

  it('hydrate le store puis affiche la vue Trip existante', async () => {
    fetchTrip.mockResolvedValue(trip);
    renderAt('t1');

    expect(screen.getByRole('status')).toBeInTheDocument();

    expect(
      await screen.findByRole('heading', { name: 'Boucle des Vosges' }),
    ).toBeInTheDocument();
    expect(fetchTrip).toHaveBeenCalledWith('t1', 'free');
    expect(useTripStore.getState().saved).toEqual(trip);
    // Brouillon : le bouton Sauvegarder reste actif (promotion possible)
    expect(screen.getByRole('button', { name: 'Sauvegarder' })).toBeEnabled();
  });

  it('affiche « introuvable » avec un lien vers Mes trips quand le fetch échoue', async () => {
    fetchTrip.mockResolvedValue(null);
    renderAt('inconnu');

    expect(await screen.findByText('Trip introuvable.')).toBeInTheDocument();
    const back = screen.getByRole('link', { name: 'Mes trips' });
    expect(back).toHaveAttribute('href', '/trips');
  });
});
