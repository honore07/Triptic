import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TripTuner } from '../components/TripTuner';
import { useUserStore } from '../store/userStore';
import { setLang } from '../lib/i18n';

describe('TripTuner', () => {
  it('renders the 4 sliders with their labels (fr)', () => {
    setLang('fr');
    render(<TripTuner onConfirm={() => {}} />);
    expect(screen.getByLabelText(/Niveau sportif/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Rythme/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Activités/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Exploration/)).toBeInTheDocument();
    expect(screen.getAllByRole('slider')).toHaveLength(4);
  });

  it('confirms with the adjusted values', () => {
    setLang('fr');
    const onConfirm = vi.fn();
    render(<TripTuner onConfirm={onConfirm} />);
    fireEvent.change(screen.getByLabelText(/Niveau sportif/), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText(/Exploration/), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: /Générer mes 3 trips sur-mesure/ }));
    expect(onConfirm).toHaveBeenCalledWith(
      { physical: 5, pace: 3, culture: 3, discovery: 1 },
      {},
    );
  });

  it('defaults every slider to neutral 3/5', () => {
    setLang('fr');
    const onConfirm = vi.fn();
    render(<TripTuner onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: /Générer mes 3 trips sur-mesure/ }));
    expect(onConfirm).toHaveBeenCalledWith(
      { physical: 3, pace: 3, culture: 3, discovery: 3 },
      {},
    );
  });

  it('boucle par défaut : le point de départ sert aussi d’arrivée', () => {
    setLang('fr');
    const onConfirm = vi.fn();
    render(<TripTuner onConfirm={onConfirm} />);
    expect(screen.queryByLabelText(/Point d’arrivée|Point d'arrivée/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Point de départ/), {
      target: { value: '  Strasbourg  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Générer mes 3 trips sur-mesure/ }));
    expect(onConfirm).toHaveBeenCalledWith(expect.anything(), {
      departure: 'Strasbourg',
      destination: 'Strasbourg',
    });
  });

  it('boucle décochée : arrivée distincte transmise', () => {
    setLang('fr');
    const onConfirm = vi.fn();
    render(<TripTuner onConfirm={onConfirm} />);
    fireEvent.click(screen.getByLabelText(/Boucle/));
    fireEvent.change(screen.getByLabelText(/Point de départ/), { target: { value: 'Colmar' } });
    fireEvent.change(screen.getByLabelText(/Point d’arrivée|Point d'arrivée/), {
      target: { value: 'Genève' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Générer mes 3 trips sur-mesure/ }));
    expect(onConfirm).toHaveBeenCalledWith(expect.anything(), {
      departure: 'Colmar',
      destination: 'Genève',
    });
  });

  it('translates to German', () => {
    setLang('de');
    render(<TripTuner onConfirm={() => {}} />);
    expect(screen.getByLabelText(/Sportlevel/)).toBeInTheDocument();
    setLang('fr');
  });

  describe('sélecteur de mode (van life en premier plan)', () => {
    it('liste van life en premier, puis trek, puis bikepacking', () => {
      setLang('fr');
      useUserStore.setState({ plan: 'free', paywallOpen: false });
      render(<TripTuner onConfirm={() => {}} />);
      const group = screen.getByRole('group', { name: "Mode d'aventure" });
      const labels = Array.from(group.querySelectorAll('button')).map((b) => b.textContent);
      expect(labels[0]).toContain('Van life');
      expect(labels[1]).toContain('Trek');
      expect(labels[2]).toContain('Bikepacking');
    });

    it('sans sélection, aucun override modes ne part (l IA déduit)', () => {
      setLang('fr');
      useUserStore.setState({ plan: 'aventurier', paywallOpen: false });
      const onConfirm = vi.fn();
      render(<TripTuner onConfirm={onConfirm} />);
      fireEvent.click(screen.getByRole('button', { name: /Générer mes 3 trips sur-mesure/ }));
      expect(onConfirm).toHaveBeenCalledWith(expect.anything(), {});
      useUserStore.setState({ plan: 'free' });
    });

    it('sélectionner Trek (plan payant) envoie modes: [trek] ; re-cliquer désélectionne', () => {
      setLang('fr');
      useUserStore.setState({ plan: 'aventurier', paywallOpen: false });
      const onConfirm = vi.fn();
      render(<TripTuner onConfirm={onConfirm} />);
      const trek = screen.getByRole('button', { name: 'Trek' });
      fireEvent.click(trek);
      expect(trek).toHaveAttribute('aria-pressed', 'true');
      fireEvent.click(screen.getByRole('button', { name: /Générer mes 3 trips sur-mesure/ }));
      expect(onConfirm).toHaveBeenLastCalledWith(expect.anything(), { modes: ['trek'] });
      fireEvent.click(trek);
      expect(trek).toHaveAttribute('aria-pressed', 'false');
      fireEvent.click(screen.getByRole('button', { name: /Générer mes 3 trips sur-mesure/ }));
      expect(onConfirm).toHaveBeenLastCalledWith(expect.anything(), {});
      useUserStore.setState({ plan: 'free' });
    });

    it('plan gratuit : trek et bikepacking verrouillés → ouvre le paywall, pas de sélection', () => {
      setLang('fr');
      useUserStore.setState({ plan: 'free', paywallOpen: false });
      const onConfirm = vi.fn();
      render(<TripTuner onConfirm={onConfirm} />);
      const trek = screen.getByRole('button', { name: /Trek/ });
      fireEvent.click(trek);
      expect(useUserStore.getState().paywallOpen).toBe(true);
      expect(trek).toHaveAttribute('aria-pressed', 'false');
      fireEvent.click(screen.getByRole('button', { name: /Générer mes 3 trips sur-mesure/ }));
      expect(onConfirm).toHaveBeenCalledWith(expect.anything(), {});
      useUserStore.setState({ paywallOpen: false });
    });

    it('plan gratuit : Van life reste sélectionnable et envoie modes: [roadtrip]', () => {
      setLang('fr');
      useUserStore.setState({ plan: 'free', paywallOpen: false });
      const onConfirm = vi.fn();
      render(<TripTuner onConfirm={onConfirm} />);
      fireEvent.click(screen.getByRole('button', { name: 'Van life' }));
      fireEvent.click(screen.getByRole('button', { name: /Générer mes 3 trips sur-mesure/ }));
      expect(onConfirm).toHaveBeenCalledWith(expect.anything(), { modes: ['roadtrip'] });
    });
  });
});
