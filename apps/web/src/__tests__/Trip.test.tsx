import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Trip, TripProposal } from '@triptic/shared';
import { TripPage } from '../pages/Trip';
import { useTripStore } from '../store/tripStore';
import { useUserStore } from '../store/userStore';
import { setLang } from '../lib/i18n';
import * as api from '../lib/api';

vi.mock('../lib/api', () => ({
  saveTrip: vi.fn(),
  updateTrip: vi.fn(),
  recomputeTrip: vi.fn(),
}));

// Composants lourds (Mapbox, fetch météo, SSE) hors du périmètre de ces tests
vi.mock('../components/MapView', () => ({ MapView: () => <div data-testid="map" /> }));
vi.mock('../components/WeatherStrip', () => ({ WeatherStrip: () => null }));
vi.mock('../components/TripEditChat', () => ({ TripEditChat: () => null }));
vi.mock('../components/GPXExportButton', () => ({ GPXExportButton: () => null }));

const saveTrip = vi.mocked(api.saveTrip);
const updateTrip = vi.mocked(api.updateTrip);
const recomputeTrip = vi.mocked(api.recomputeTrip);

const proposal: TripProposal = {
  title: 'Boucle des Vosges',
  mode: 'roadtrip',
  duration_days: 3,
  distance_km: 240,
  elevation_gain_m: 3200,
  difficulty: 'medium',
  ambiance: 'sauvage',
  summary: 'Trois jours entre cols et lacs.',
  daily_distance_km: 80,
  waypoints: [
    { name: 'Colmar', lat: 48.08, lng: 7.36, day: 1, kind: 'start' },
    { name: 'Munster', lat: 48.04, lng: 7.14, day: 3, kind: 'end' },
  ],
  photo_keywords: ['vosges'],
  budget: {
    fuel_eur: 40,
    tolls_eur: [10, 20],
    nights_eur: [35, 35],
    meals_eur: [60, 90],
    activities_eur: 0,
    total_eur: [145, 185],
  },
};

const { waypoints: _w, title: _t, days: _d, ...metadata } = proposal;

const savedTrip: Trip = {
  id: 't1',
  user_id: null,
  title: proposal.title,
  slug: null,
  is_public: false,
  mode: proposal.mode,
  status: 'saved',
  metadata,
  waypoints: proposal.waypoints,
  days: null,
  cover_photo: null,
  created_at: '2026-07-29T00:00:00Z',
  updated_at: '2026-07-29T00:00:00Z',
};

function renderTrip() {
  return render(
    <MemoryRouter>
      <TripPage />
    </MemoryRouter>,
  );
}

describe('TripPage', () => {
  beforeEach(() => {
    setLang('fr');
    saveTrip.mockReset();
    updateTrip.mockReset();
    recomputeTrip.mockReset();
    useUserStore.setState({ plan: 'free' });
    useTripStore.setState({
      selected: proposal,
      saved: null,
      history: [],
      recomputing: false,
      error: null,
    });
  });

  it('affiche la valeur seule quand une fourchette budget a min = max (QA 1.7)', () => {
    renderTrip();
    expect(screen.getByText('35 €')).toBeInTheDocument();
    expect(screen.queryByText(/35–35/)).not.toBeInTheDocument();
    // Les vraies fourchettes restent affichées en min–max
    expect(screen.getByText('10–20 €')).toBeInTheDocument();
  });

  it('partage un trip déjà sauvegardé via PATCH updateTrip — jamais de re-POST (QA 1.3)', async () => {
    updateTrip.mockResolvedValue({ ...savedTrip, is_public: true, slug: 'boucle-abc123' });
    useTripStore.setState({ saved: savedTrip });
    renderTrip();

    fireEvent.click(screen.getByRole('button', { name: 'Lien public' }));

    await waitFor(() =>
      expect(updateTrip).toHaveBeenCalledWith('t1', proposal, 'free', { is_public: true }),
    );
    expect(saveTrip).not.toHaveBeenCalled();
  });

  it('sans clipboard (contexte HTTP), affiche l’URL publique dans un input sélectionnable (QA 1.1)', async () => {
    // jsdom : navigator.clipboard est indisponible, comme en prod HTTP
    updateTrip.mockResolvedValue({ ...savedTrip, is_public: true, slug: 'boucle-abc123' });
    useTripStore.setState({ saved: savedTrip });
    renderTrip();

    fireEvent.click(screen.getByRole('button', { name: 'Lien public' }));

    const input = await screen.findByRole('textbox', { name: 'Lien public' });
    expect((input as HTMLInputElement).value).toContain('/trip/boucle-abc123');
    expect(input).toHaveAttribute('readonly');
  });

  it('affiche une erreur visible si la sauvegarde échoue (QA 1.5)', async () => {
    saveTrip.mockRejectedValue(new Error('500'));
    renderTrip();

    fireEvent.click(screen.getByRole('button', { name: 'Sauvegarder' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/L'action a échoué/);
  });

  it("affiche une erreur visible si le partage échoue (QA 1.5)", async () => {
    updateTrip.mockResolvedValue(null); // PATCH non-ok → null
    useTripStore.setState({ saved: savedTrip });
    renderTrip();

    fireEvent.click(screen.getByRole('button', { name: 'Lien public' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/L'action a échoué/);
  });
});

describe('tripStore.applyDays', () => {
  beforeEach(() => {
    recomputeTrip.mockReset();
    useTripStore.setState({
      selected: proposal,
      saved: null,
      history: [],
      recomputing: false,
      error: null,
    });
  });

  it("capture l'échec réseau du recalcul et expose un état d'erreur (QA 1.5)", async () => {
    recomputeTrip.mockRejectedValue(new Error('network'));
    const days = [
      {
        day: 1,
        title: 'Colmar → Munster',
        activities: [
          { type: 'drive' as const, time_of_day: 'morning' as const, title: 'Route des crêtes', lat: 48.05, lng: 7.2 },
        ],
      },
    ];

    await useTripStore.getState().applyDays(days, 'free');

    expect(useTripStore.getState().error).toBe('recompute_failed');
    expect(useTripStore.getState().recomputing).toBe(false);
    // L'édition optimiste locale est conservée malgré l'échec du recalcul
    expect(useTripStore.getState().selected?.days).toEqual(days);
  });

  it("repart sans erreur quand un recalcul suivant réussit", async () => {
    recomputeTrip.mockResolvedValue(null);
    useTripStore.setState({ error: 'recompute_failed' });

    await useTripStore
      .getState()
      .applyDays(
        [{ day: 1, title: 'J1', activities: [{ type: 'rest' as const, time_of_day: 'evening' as const, title: 'Repos', lat: 48, lng: 7 }] }],
        'free',
      );

    expect(useTripStore.getState().error).toBeNull();
  });
});
