import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthPage } from '../pages/Auth';
import { authErrorKey } from '../lib/authErrors';
import { useUserStore } from '../store/userStore';
import { setLang } from '../lib/i18n';

const navigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

const auth = vi.hoisted(() => ({
  getSession: vi.fn(async () => ({ data: { session: null } })),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: () => undefined } } })),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  signInWithOAuth: vi.fn(),
}));
vi.mock('../lib/supabase', () => ({ supabase: { auth } }));

const google = vi.hoisted(() => ({ enabled: false }));
vi.mock('../lib/authProviders', () => ({ isGoogleEnabled: async () => google.enabled }));

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function renderAuth() {
  return render(<AuthPage />, { wrapper: MemoryRouter });
}

describe('Connexion (planche PL.02)', () => {
  beforeEach(() => {
    setLang('fr');
    navigate.mockClear();
    for (const action of [
      auth.signInWithPassword,
      auth.signUp,
      auth.resetPasswordForEmail,
      auth.updateUser,
      auth.signInWithOAuth,
    ]) {
      action.mockReset();
    }
    google.enabled = false;
    useUserStore.setState({ email: null, recovery: false });
  });

  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('dit précisément pourquoi la connexion échoue', async () => {
    auth.signInWithPassword.mockResolvedValue({
      data: { session: null, user: null },
      error: { code: 'invalid_credentials', status: 400 },
    });
    renderAuth();
    fill('Adresse', 'marcheur@vire.test');
    fill('Mot de passe', 'mauvais-mot-de-passe');
    fireEvent.click(screen.getByRole('button', { name: 'Entrer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Email ou mot de passe incorrect.');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('inscription avec confirmation d’email : demande d’ouvrir le lien au lieu de faire entrer', async () => {
    auth.signUp.mockResolvedValue({ data: { session: null, user: { id: 'u1' } }, error: null });
    renderAuth();
    fireEvent.click(screen.getByRole('button', { name: 'En ouvrir un' }));
    fill('Adresse', 'marcheur@vire.test');
    fill('Mot de passe', 'un-bon-mot-de-passe');
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir mon carnet' }));
    expect(await screen.findByRole('status')).toHaveTextContent('marcheur@vire.test');
    expect(auth.signUp).toHaveBeenCalledWith({
      email: 'marcheur@vire.test',
      password: 'un-bon-mot-de-passe',
      options: { emailRedirectTo: expect.stringMatching(/\/login$/) },
    });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('adresse déjà inscrite : oriente vers la connexion ou le mot de passe oublié', async () => {
    auth.signUp.mockResolvedValue({
      data: { session: null, user: null },
      error: { code: 'user_already_exists', status: 422 },
    });
    renderAuth();
    fireEvent.click(screen.getByRole('button', { name: 'En ouvrir un' }));
    fill('Adresse', 'marcheur@vire.test');
    fill('Mot de passe', 'un-bon-mot-de-passe');
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir mon carnet' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Un carnet existe déjà');
  });

  it('mot de passe oublié : envoie le lien vers la page de connexion', async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    renderAuth();
    fireEvent.click(screen.getByRole('button', { name: 'Mot de passe oublié ?' }));
    expect(screen.queryByLabelText('Mot de passe')).not.toBeInTheDocument();
    fill('Adresse', 'marcheur@vire.test');
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer le lien' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Si un carnet existe');
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('marcheur@vire.test', {
      redirectTo: expect.stringMatching(/\/login$/),
    });
  });

  it('arrivé par le lien de réinitialisation : enregistre le nouveau mot de passe', async () => {
    auth.updateUser.mockResolvedValue({ data: { user: {} }, error: null });
    useUserStore.setState({ email: 'marcheur@vire.test', recovery: true });
    renderAuth();
    expect(
      screen.getByRole('heading', { name: 'Choisis un nouveau mot de passe.' }),
    ).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
    fill('Nouveau mot de passe', 'nouveau-mot-de-passe');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le mot de passe' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/', { replace: true }));
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'nouveau-mot-de-passe' });
    expect(useUserStore.getState().recovery).toBe(false);
  });

  it('lien expiré ou déjà servi : le dit, puis retire l’erreur de l’adresse', () => {
    window.history.replaceState(null, '', '/login#error=access_denied&error_code=otp_expired');
    renderAuth();
    expect(screen.getByRole('alert')).toHaveTextContent("Ce lien n'est plus valable");
    expect(window.location.hash).toBe('');
  });

  it('masque Google tant que le fournisseur n’est pas activé sur Supabase', async () => {
    renderAuth();
    await act(async () => undefined);
    expect(screen.queryByRole('button', { name: 'Continuer avec Google' })).not.toBeInTheDocument();
  });

  it('montre Google dès que le fournisseur est activé', async () => {
    google.enabled = true;
    renderAuth();
    expect(await screen.findByRole('button', { name: 'Continuer avec Google' })).toBeInTheDocument();
  });

  it('un carnet déjà ouvert quitte la page de connexion', () => {
    useUserStore.setState({ email: 'marcheur@vire.test', recovery: false });
    renderAuth();
    expect(navigate).toHaveBeenCalledWith('/', { replace: true });
  });
});

describe('authErrorKey', () => {
  it('suit le code Supabase, pas le texte anglais', () => {
    expect(authErrorKey({ code: 'weak_password', status: 422 })).toBe('error_weak_password');
    expect(authErrorKey({ code: 'over_email_send_rate_limit', status: 429 })).toBe(
      'error_rate_limit',
    );
    expect(authErrorKey({ code: 'email_not_confirmed' })).toBe('error_not_confirmed');
  });

  it('un 429 sans code reste une limite ; le reste, un échec générique', () => {
    expect(authErrorKey({ status: 429 })).toBe('error_rate_limit');
    expect(authErrorKey({ code: 'toString' })).toBe('error_generic');
    expect(authErrorKey(null)).toBe('error_generic');
  });
});
