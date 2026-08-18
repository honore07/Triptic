import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Trip } from '@triptic/shared';
import { MyTrips } from '../pages/MyTrips';
import { useUserStore } from '../store/userStore';
import { setLang } from '../lib/i18n';
import * as api from '../lib/api';

vi.mock('../lib/api', () => ({
  listTrips: vi.fn(),
}));

// Comportement historique testé ici : mode sans auth (supabase absent).
// Le cas « auth configurée + déconnecté » a son propre test plus bas.
vi.mock('../lib/supabase', () => ({ supabase: null }));

const listTrips = vi.mocked(api.listTrips);

function makeTrip(overrides: Partial<Trip>): Trip {
  return {
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
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <MyTrips />
    </MemoryRouter>,
  );
}

describe('MyTrips', () => {
  beforeEach(() => {
    setLang('fr');
    listTrips.mockReset();
    useUserStore.setState({ plan: 'free' });
  });

  it('affiche un squelette de chargement pendant le fetch', () => {
    listTrips.mockReturnValue(new Promise(() => {})); // jamais résolu
    renderPage();
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('Chargement de tes trips…')).toBeInTheDocument();
  });

  it('liste les trips en cartes : titre, badges mode/statut, durée, distance, lien', async () => {
    listTrips.mockResolvedValue([
      makeTrip({ id: 't1', status: 'draft', updated_at: '2026-08-01T00:00:00Z' }),
      makeTrip({
        id: 't2',
        title: 'Tour du Hohneck',
        status: 'saved',
        updated_at: '2026-08-03T00:00:00Z',
      }),
    ]);
    renderPage();

    expect(await screen.findByText('Boucle des Vosges')).toBeInTheDocument();
    expect(screen.getByText('Tour du Hohneck')).toBeInTheDocument();
    expect(screen.getByText('Brouillon')).toBeInTheDocument();
    expect(screen.getByText('Sauvegardé')).toBeInTheDocument();
    expect(screen.getAllByText('Road trip')).toHaveLength(2);
    expect(screen.getAllByText('3 jours')).toHaveLength(2);
    expect(screen.getAllByText('240 km')).toHaveLength(2);

    const links = screen.getAllByRole('link', { name: /Ouvrir/ });
    // Tri : le plus récemment modifié d'abord
    expect(links[0]).toHaveAttribute('href', '/trips/t2');
    expect(links[1]).toHaveAttribute('href', '/trips/t1');
  });

  it('affiche un état vide engageant avec CTA vers /plan', async () => {
    listTrips.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText("Aucun trip pour l'instant.")).toBeInTheDocument();
    const cta = screen.getByRole('link', { name: 'Planifier mon premier trip' });
    expect(cta).toHaveAttribute('href', '/plan');
  });

  it('affiche une erreur avec bouton réessayer qui relance le fetch', async () => {
    listTrips.mockRejectedValueOnce(new Error('network'));
    listTrips.mockResolvedValueOnce([makeTrip({})]);
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(/Le chargement a échoué/);

    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));

    expect(await screen.findByText('Boucle des Vosges')).toBeInTheDocument();
    expect(listTrips).toHaveBeenCalledTimes(2);
  });
});
