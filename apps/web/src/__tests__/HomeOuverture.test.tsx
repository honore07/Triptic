import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Home } from '../pages/Home';
import { useUserStore } from '../store/userStore';
import { setLang } from '../lib/i18n';

const navigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

// Piloté par test : `supabase` décide si l'ouverture mène à la connexion
// (auth configurée) ou directement à l'accueil (dev/démo sans auth).
const authConfigured = vi.hoisted(() => ({ value: false }));
vi.mock('../lib/supabase', () => ({
  get supabase() {
    return authConfigured.value ? {} : null;
  },
}));

/** Connecté = un carnet est ouvert ; déconnecté = email null. */
function setAccount(email: string | null) {
  useUserStore.setState({ email });
}

describe('Home — porte d’entrée sans compte (PL.01 → PL.02)', () => {
  beforeEach(() => {
    setLang('fr');
    navigate.mockClear();
    authConfigured.value = false;
    setAccount(null);
  });

  afterEach(() => setAccount(null));

  it('montre l’ouverture tant qu’aucun carnet n’est ouvert', () => {
    render(<Home />, { wrapper: MemoryRouter });
    expect(screen.getByRole('heading', { name: 'VIRE' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Où veux-tu aller ?')).not.toBeInTheDocument();
  });

  it('mène à la connexion quand l’auth est configurée', () => {
    authConfigured.value = true;
    render(<Home />, { wrapper: MemoryRouter });
    fireEvent.click(screen.getByRole('button', { name: 'Commencer' }));
    expect(navigate).toHaveBeenCalledWith('/login');
  });

  it('mène droit à l’accueil sans auth configurée (dev/démo)', () => {
    render(<Home />, { wrapper: MemoryRouter });
    fireEvent.click(screen.getByRole('button', { name: 'Commencer' }));
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Où veux-tu aller ?')).toBeInTheDocument();
  });

  it('ne montre jamais l’ouverture à un carnet déjà ouvert', () => {
    setAccount('jules@vire.app');
    render(<Home />, { wrapper: MemoryRouter });
    expect(screen.queryByRole('heading', { name: 'VIRE' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Où veux-tu aller ?')).toBeInTheDocument();
  });
});
