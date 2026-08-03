import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TripTuner } from '../components/TripTuner';
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
      null,
      {},
    );
  });

  it('defaults every slider to neutral 3/5 (sans dates → null)', () => {
    setLang('fr');
    const onConfirm = vi.fn();
    render(<TripTuner onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: /Générer mes 3 trips sur-mesure/ }));
    expect(onConfirm).toHaveBeenCalledWith(
      { physical: 3, pace: 3, culture: 3, discovery: 3 },
      null,
      {},
    );
  });

  it('transmet les dates et affiche durée + saison', () => {
    setLang('fr');
    const onConfirm = vi.fn();
    render(<TripTuner onConfirm={onConfirm} />);
    const year = new Date().getFullYear() + 1;
    fireEvent.change(screen.getByLabelText(/^Départ$/), { target: { value: `${year}-07-10` } });
    fireEvent.change(screen.getByLabelText(/Retour/), { target: { value: `${year}-07-14` } });
    expect(screen.getByText(/5 jours · Été/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Générer mes 3 trips sur-mesure/ }));
    expect(onConfirm).toHaveBeenCalledWith(
      expect.anything(),
      { start: `${year}-07-10`, end: `${year}-07-14` },
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
    expect(onConfirm).toHaveBeenCalledWith(expect.anything(), null, {
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
    expect(onConfirm).toHaveBeenCalledWith(expect.anything(), null, {
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
});
