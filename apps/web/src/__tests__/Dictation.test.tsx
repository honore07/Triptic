import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Home } from '../pages/Home';
import { useUserStore } from '../store/userStore';
import { setLang } from '../lib/i18n';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});
vi.mock('../lib/supabase', () => ({ supabase: null }));

/** Reconnaissance vocale factice — on pilote les résultats depuis le test. */
class FakeRecognition {
  static last: FakeRecognition | null = null;
  lang = '';
  continuous = false;
  interimResults = true;
  started = false;
  onresult: ((event: unknown) => void) | null = null;
  onerror: (() => void) | null = null;
  onend: (() => void) | null = null;
  constructor() {
    FakeRecognition.last = this;
  }
  start() {
    this.started = true;
  }
  stop() {
    this.started = false;
    this.onend?.();
  }
  /** Simule un segment définitif reconnu. */
  say(transcript: string) {
    this.onresult?.({
      resultIndex: 0,
      results: [Object.assign([{ transcript }], { isFinal: true })],
    });
  }
}

const w = window as unknown as { SpeechRecognition?: unknown };

describe('Dictée de la demande (accueil)', () => {
  beforeEach(() => {
    setLang('fr');
    useUserStore.setState({ email: 'jules@vire.app', plan: 'free' });
    FakeRecognition.last = null;
    w.SpeechRecognition = FakeRecognition;
  });

  afterEach(() => {
    delete w.SpeechRecognition;
    useUserStore.setState({ email: null });
  });

  it('propose le micro quand le navigateur sait dicter', () => {
    render(<Home />, { wrapper: MemoryRouter });
    expect(screen.getByRole('button', { name: 'Dicter ma demande' })).toBeInTheDocument();
  });

  it('masque le micro là où l’API n’existe pas, plutôt qu’un bouton inerte', () => {
    delete w.SpeechRecognition;
    render(<Home />, { wrapper: MemoryRouter });
    expect(screen.queryByRole('button', { name: /Dicter/ })).not.toBeInTheDocument();
  });

  it('la dictée s’ajoute à la demande au lieu de la remplacer', () => {
    render(<Home />, { wrapper: MemoryRouter });
    const champ = screen.getByLabelText('Où veux-tu aller ?');
    fireEvent.change(champ, { target: { value: 'Trois jours' } });
    fireEvent.click(screen.getByRole('button', { name: 'Dicter ma demande' }));
    act(() => FakeRecognition.last?.say('autour du Hohneck'));
    expect(champ).toHaveValue('Trois jours autour du Hohneck');
  });

  it('dicte dans la langue de l’interface', () => {
    setLang('de');
    render(<Home />, { wrapper: MemoryRouter });
    fireEvent.click(screen.getByRole('button', { name: 'Anfrage diktieren' }));
    expect(FakeRecognition.last?.lang).toBe('de');
    setLang('fr');
  });

  it('le micro bascule en arrêt pendant l’écoute', () => {
    render(<Home />, { wrapper: MemoryRouter });
    const micro = screen.getByRole('button', { name: 'Dicter ma demande' });
    fireEvent.click(micro);
    const stop = screen.getByRole('button', { name: 'Arrêter la dictée' });
    expect(stop).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(stop);
    expect(screen.getByRole('button', { name: 'Dicter ma demande' })).toBeInTheDocument();
  });

  it('un micro refusé retombe au repos sans bloquer la saisie', () => {
    render(<Home />, { wrapper: MemoryRouter });
    fireEvent.click(screen.getByRole('button', { name: 'Dicter ma demande' }));
    act(() => FakeRecognition.last?.onerror?.());
    expect(screen.getByRole('button', { name: 'Dicter ma demande' })).toBeInTheDocument();
  });
});
