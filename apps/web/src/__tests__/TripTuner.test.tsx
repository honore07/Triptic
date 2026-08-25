import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TripTuner } from '../components/TripTuner';
import { setLang } from '../lib/i18n';

const CTA = /Générer trois vires/;
const NEUTRAL = { physical: 3, pace: 3, culture: 3, discovery: 3 };

describe('TripTuner (planche PL.05 — précisions)', () => {
  beforeEach(() => setLang('fr'));

  it('pose la cordée, le sac et les 4 axes de différenciation', () => {
    render(<TripTuner onConfirm={() => {}} />);
    expect(screen.getByLabelText('Nous serons')).toBeInTheDocument();
    expect(screen.getByLabelText('Poids du sac')).toBeInTheDocument();
    expect(screen.getByLabelText('Niveau sportif')).toBeInTheDocument();
    expect(screen.getByLabelText('Exploration')).toBeInTheDocument();
    expect(screen.getAllByRole('slider')).toHaveLength(6);
  });

  it('confirme les axes ajustés et la cordée par défaut (à deux)', () => {
    const onConfirm = vi.fn();
    render(<TripTuner onConfirm={onConfirm} />);
    fireEvent.change(screen.getByLabelText('Niveau sportif'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Exploration'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: CTA }));
    expect(onConfirm).toHaveBeenCalledWith(
      { physical: 5, pace: 3, culture: 3, discovery: 1 },
      { group_type: 'couple' },
    );
  });

  it('le curseur de cordée mappe l’énumération du moteur', () => {
    const onConfirm = vi.fn();
    render(<TripTuner onConfirm={onConfirm} />);
    fireEvent.change(screen.getByLabelText('Nous serons'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: CTA }));
    expect(onConfirm).toHaveBeenCalledWith(NEUTRAL, { group_type: 'solo' });
  });

  it('les contraintes cochées partent en texte, dans la langue de l’utilisateur', () => {
    const onConfirm = vi.fn();
    render(<TripTuner onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('switch', { name: 'Arrivée en train' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Chien de la cordée' }));
    fireEvent.click(screen.getByRole('button', { name: CTA }));
    expect(onConfirm).toHaveBeenCalledWith(NEUTRAL, {
      group_type: 'couple',
      constraints: ['Arrivée en train', 'Chien de la cordée'],
    });
  });

  it('un sac standard n’encombre pas la demande, un sac atypique si', () => {
    const onConfirm = vi.fn();
    render(<TripTuner onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: CTA }));
    expect(onConfirm).toHaveBeenLastCalledWith(NEUTRAL, { group_type: 'couple' });

    fireEvent.change(screen.getByLabelText('Poids du sac'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: CTA }));
    expect(onConfirm).toHaveBeenLastCalledWith(NEUTRAL, {
      group_type: 'couple',
      constraints: ['Ultra-léger'],
    });
  });

  it('le champ libre rejoint les contraintes', () => {
    const onConfirm = vi.fn();
    render(<TripTuner onConfirm={onConfirm} />);
    fireEvent.change(screen.getByLabelText('Autre chose ?'), {
      target: { value: '  Éviter le col de la Schlucht  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: CTA }));
    expect(onConfirm).toHaveBeenLastCalledWith(NEUTRAL, {
      group_type: 'couple',
      constraints: ['Éviter le col de la Schlucht'],
    });
  });

  it('boucle par défaut : le point de départ sert aussi d’arrivée', () => {
    const onConfirm = vi.fn();
    render(<TripTuner onConfirm={onConfirm} />);
    expect(screen.queryByText(/Point d’arrivée|Point d'arrivée/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Point de départ/), {
      target: { value: '  Strasbourg  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: CTA }));
    expect(onConfirm).toHaveBeenCalledWith(NEUTRAL, {
      departure: 'Strasbourg',
      destination: 'Strasbourg',
      group_type: 'couple',
    });
  });

  it('boucle décochée : arrivée distincte transmise', () => {
    const onConfirm = vi.fn();
    render(<TripTuner onConfirm={onConfirm} />);
    fireEvent.click(screen.getByLabelText(/Boucle/));
    fireEvent.change(screen.getByLabelText(/Point de départ/), { target: { value: 'Colmar' } });
    fireEvent.change(screen.getByLabelText(/Point d’arrivée|Point d'arrivée/), {
      target: { value: 'Genève' },
    });
    fireEvent.click(screen.getByRole('button', { name: CTA }));
    expect(onConfirm).toHaveBeenCalledWith(NEUTRAL, {
      departure: 'Colmar',
      destination: 'Genève',
      group_type: 'couple',
    });
  });

  it('rappelle la fenêtre posée en PL.04 dans le relevé de bas de planche', () => {
    render(<TripTuner dates={{ start: '2026-07-10', end: '2026-07-14' }} onConfirm={() => {}} />);
    expect(screen.getByText('Été')).toBeInTheDocument();
    expect(screen.getByText('Soutenu')).toBeInTheDocument(); // engagement 3/5 par défaut
  });

  it('sans fenêtre, aucun relevé n’est affiché', () => {
    render(<TripTuner onConfirm={() => {}} />);
    expect(screen.queryByText('Été')).not.toBeInTheDocument();
  });

  it('translates to German', () => {
    setLang('de');
    render(<TripTuner onConfirm={() => {}} />);
    expect(screen.getByLabelText('Sportlevel')).toBeInTheDocument();
    expect(screen.getByLabelText('Rucksackgewicht')).toBeInTheDocument();
    setLang('fr');
  });
});
