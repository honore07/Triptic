import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Home } from '../pages/Home';
import { useChatStore } from '../store/chatStore';
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

describe('Home — sélecteur de mode (planche PL.03)', () => {
  beforeEach(() => {
    setLang('fr');
    navigate.mockClear();
    authConfigured.value = false;
    setAccount('jules@vire.app'); // carnet ouvert : on voit l'accueil
    useUserStore.setState({ plan: 'free', paywallOpen: false });
    useChatStore.getState().reset();
  });

  afterEach(() => setAccount(null));

  it('liste van life en premier, puis trek, puis bikepacking', () => {
    render(<Home />, { wrapper: MemoryRouter });
    const group = screen.getByRole('group', { name: "Mode d'aventure" });
    const labels = Array.from(group.querySelectorAll('button')).map((b) => b.textContent);
    expect(labels[0]).toContain('Van life');
    expect(labels[1]).toContain('Trek');
    expect(labels[2]).toContain('Bikepacking');
  });

  it('la question suit le mode choisi', () => {
    useUserStore.setState({ plan: 'aventurier' });
    render(<Home />, { wrapper: MemoryRouter });
    expect(screen.getByRole('heading', { name: 'Où roules-tu cette fois ?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Trek' }));
    expect(screen.getByRole('heading', { name: 'Où marches-tu cette fois ?' })).toBeInTheDocument();
  });

  it('le mode choisi part vraiment vers la génération', () => {
    useUserStore.setState({ plan: 'aventurier' });
    render(<Home />, { wrapper: MemoryRouter });
    fireEvent.click(screen.getByRole('button', { name: 'Trek' }));
    fireEvent.change(screen.getByLabelText('Où veux-tu aller ?'), {
      target: { value: 'Hohneck en bivouac' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tracer trois vires' }));
    expect(useChatStore.getState().overrides.modes).toEqual(['trek']);
    expect(navigate).toHaveBeenCalledWith('/plan', {
      state: { initialQuery: 'Hohneck en bivouac' },
    });
  });

  it('plan gratuit : un mode verrouillé ouvre le paywall sans se sélectionner', () => {
    render(<Home />, { wrapper: MemoryRouter });
    const trek = screen.getByRole('button', { name: /^Trek —/ });
    fireEvent.click(trek);
    expect(useUserStore.getState().paywallOpen).toBe(true);
    expect(trek).toHaveAttribute('aria-pressed', 'false');
    useUserStore.setState({ paywallOpen: false });
  });

  it('un mode verrouillé annonce lequel, pas seulement la raison', () => {
    render(<Home />, { wrapper: MemoryRouter });
    expect(
      screen.getByRole('button', {
        name: 'Bikepacking — Réservé aux plans Aventurier et Explorateur',
      }),
    ).toBeInTheDocument();
  });
});
