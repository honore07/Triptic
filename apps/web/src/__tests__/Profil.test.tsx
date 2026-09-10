import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Profil } from '../pages/Profil';
import { Vehicule } from '../pages/Vehicule';
import {
  DEFAULT_PREFERENCES,
  profileConstraints,
  useProfileStore,
} from '../store/profileStore';
import { useUserStore } from '../store/userStore';
import { formatDistance, formatElevation } from '../lib/units';
import { setLang } from '../lib/i18n';

// Piloté par test : sans auth configurée, le profil ne propose ni déconnexion
// ni suppression de compte.
const authClient = vi.hoisted(() => ({
  configured: false,
  signOut: vi.fn(async (_options?: { scope: string }) => ({ error: null })),
}));
vi.mock('../lib/supabase', () => ({
  get supabase() {
    return authClient.configured ? { auth: { signOut: authClient.signOut } } : null;
  },
}));

const deleteAccount = vi.hoisted(() => vi.fn<(plan: string) => Promise<string | null>>());
vi.mock('../lib/api', async () => ({
  ...(await vi.importActual<typeof import('../lib/api')>('../lib/api')),
  deleteAccount,
}));

describe('Profil (planche PL.14)', () => {
  beforeEach(() => {
    setLang('fr');
    useProfileStore.setState({
      units: 'metric',
      preferences: DEFAULT_PREFERENCES,
      vehicle: null,
    });
  });

  it('bascule les unités et le retient', () => {
    render(<Profil />, { wrapper: MemoryRouter });
    fireEvent.click(screen.getByRole('button', { name: 'Impérial' }));
    expect(useProfileStore.getState().units).toBe('imperial');
  });

  it('bascule une préférence et le retient', () => {
    render(<Profil />, { wrapper: MemoryRouter });
    fireEvent.click(screen.getByRole('switch', { name: 'Éviter les refuges' }));
    expect(useProfileStore.getState().preferences.avoid_refuges).toBe(true);
  });

  it('annonce qu’aucun véhicule n’est enregistré', () => {
    render(<Profil />, { wrapper: MemoryRouter });
    expect(screen.getByText('Aucun véhicule enregistré')).toBeInTheDocument();
  });
});

describe('Profil — fermer son carnet (droit à l’effacement)', () => {
  beforeEach(() => {
    setLang('fr');
    authClient.configured = true;
    authClient.signOut.mockClear();
    deleteAccount.mockReset();
    useUserStore.setState({ email: 'marcheur@vire.test', plan: 'free' });
  });

  afterEach(() => {
    authClient.configured = false;
    useUserStore.setState({ email: null });
  });

  function askDeletion() {
    render(<Profil />, { wrapper: MemoryRouter });
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer mon compte' }));
  }

  it('ne supprime rien sans une confirmation explicite', () => {
    askDeletion();
    expect(screen.getByRole('button', { name: 'Supprimer définitivement' })).toBeInTheDocument();
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it('supprime le compte, efface ce que le navigateur gardait et déconnecte', async () => {
    deleteAccount.mockResolvedValue(null);
    useProfileStore.setState({ avatar: 'data:image/png;base64,AAAA' });
    askDeletion();
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer définitivement' }));
    await waitFor(() => expect(authClient.signOut).toHaveBeenCalledWith({ scope: 'local' }));
    expect(useProfileStore.getState().avatar).toBeNull();
  });

  it('dit la vérité quand seules les données ont pu être effacées', async () => {
    deleteAccount.mockResolvedValue('auth_deletion_failed');
    askDeletion();
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer définitivement' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Tes données VIRE sont effacées');
    expect(authClient.signOut).not.toHaveBeenCalled();
  });

  it('ne propose pas la suppression sans carnet ouvert', () => {
    useUserStore.setState({ email: null });
    render(<Profil />, { wrapper: MemoryRouter });
    expect(screen.queryByRole('button', { name: 'Supprimer mon compte' })).not.toBeInTheDocument();
  });
});

describe('Véhicule (planche PL.13)', () => {
  beforeEach(() => {
    setLang('fr');
    useProfileStore.setState({ preferences: DEFAULT_PREFERENCES, vehicle: null });
  });

  it('déduit le rayon d’action du réservoir et de la consommation', () => {
    render(<Vehicule />, { wrapper: MemoryRouter });
    // 75 L à 9,4 L/100 km ≈ 798 km
    expect(screen.getByText('798 km')).toBeInTheDocument();
  });

  it('recalcule le rayon quand la consommation change', () => {
    render(<Vehicule />, { wrapper: MemoryRouter });
    fireEvent.change(screen.getByLabelText(/Consommation/), { target: { value: '10' } });
    expect(screen.getByText('750 km')).toBeInTheDocument();
  });

  it('enregistre le véhicule saisi', () => {
    render(<Vehicule />, { wrapper: MemoryRouter });
    fireEvent.change(screen.getByLabelText('Nom du véhicule'), {
      target: { value: '  Le Gris  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le véhicule' }));
    expect(useProfileStore.getState().vehicle?.name).toBe('Le Gris');
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});

describe('Contraintes issues du profil', () => {
  beforeEach(() => {
    useProfileStore.setState({ preferences: DEFAULT_PREFERENCES, vehicle: null });
  });

  it('le bivouac légal par défaut part en contrainte', () => {
    expect(profileConstraints()).toEqual([{ key: 'profil.pref_legal_bivouac' }]);
  });

  it('aucune contrainte quand rien n’est demandé', () => {
    useProfileStore.setState({
      preferences: { ...DEFAULT_PREFERENCES, legal_bivouac: false },
    });
    expect(profileConstraints()).toEqual([]);
  });

  it('le gabarit du véhicule devient une contrainte de tracé chiffrée', () => {
    useProfileStore.setState({
      preferences: { ...DEFAULT_PREFERENCES, legal_bivouac: false },
      vehicle: {
        name: 'Le Gris',
        photo: null,
        height_m: 2.8,
        length_m: 5.4,
        weight_t: 3.2,
        consumption_l: 9.4,
        tank_l: 75,
        water_l: 100,
        avoid_low_bridges: true,
        avoid_unpaved: false,
        official_areas_only: false,
        service_every_days: 3,
      },
    });
    expect(profileConstraints()).toEqual([
      { key: 'vehicule.c_low_bridges', params: { m: 2.8 } },
      { key: 'vehicule.c_service', params: { days: 3 } },
    ]);
  });
});

describe('Unités d’affichage', () => {
  it('convertit sans toucher aux données métriques', () => {
    expect(formatDistance(240, 'metric')).toBe('240 km');
    expect(formatDistance(240, 'imperial')).toBe('149 mi');
    expect(formatElevation(2140, 'metric')).toBe('2140 m');
    expect(formatElevation(2140, 'imperial')).toBe('7021 ft');
  });

  it('ne rend jamais NaN', () => {
    expect(formatDistance(Number.NaN, 'metric')).toBe('—');
    expect(formatElevation(Number.NaN, 'imperial')).toBe('—');
  });
});
