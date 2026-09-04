import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { TripProposal } from '@triptic/shared';
import { TripCompare } from '../components/TripCompare';
import { setLang } from '../lib/i18n';

function trip(over: Partial<TripProposal> & { title: string }): TripProposal {
  return {
    mode: 'roadtrip',
    duration_days: 4,
    distance_km: 180,
    elevation_gain_m: 900,
    difficulty: 'medium',
    ambiance: 'sauvage',
    summary: 'Résumé.',
    daily_distance_km: 45,
    waypoints: [
      { name: 'Munster', lat: 48.04, lng: 7.14, day: 1, kind: 'start' },
      { name: 'Grand Ballon', lat: 47.9014, lng: 7.0994, day: 4, kind: 'end' },
    ],
    photo_keywords: ['vosges'],
    ...over,
  };
}

const TRIPS = [
  trip({ title: 'Classique', distance_km: 200, elevation_gain_m: 950, difficulty: 'medium' }),
  trip({ title: 'Arêtes', distance_km: 160, elevation_gain_m: 1070, difficulty: 'hard' }),
  trip({ title: 'Lacs', distance_km: 185, elevation_gain_m: 500, difficulty: 'easy' }),
];

describe('TripCompare — le triptyque (PL.07)', () => {
  it('calcule « ce qui les distingue » depuis les relevés, identique quand c’est identique', () => {
    setLang('fr');
    render(
      <TripCompare trips={TRIPS} lockedCount={0} differentiator="d" onChoose={() => {}} onUnlock={() => {}} />,
    );
    // Durée : 4 jours partout → « Identique » ; distance, D+ et difficulté varient
    expect(screen.getByText('Identique')).toBeInTheDocument();
    expect(screen.getByText('160 km → 200 km')).toBeInTheDocument();
    expect(screen.getByText('500 m → 1070 m')).toBeInTheDocument();
    expect(screen.getByText('Facile → Difficile')).toBeInTheDocument();
  });

  it('le premier volet est actif ; un tap sur un autre volet le met en avant', () => {
    setLang('fr');
    render(
      <TripCompare trips={TRIPS} lockedCount={0} differentiator="d" onChoose={() => {}} onUnlock={() => {}} />,
    );
    const plates = screen.getAllByRole('article');
    expect(plates[0]).toHaveAttribute('aria-current', 'true');
    fireEvent.click(plates[2]!);
    expect(plates[2]).toHaveAttribute('aria-current', 'true');
    expect(plates[0]).not.toHaveAttribute('aria-current');
  });

  it('choisir une vire ne passe pas par l’activation du volet', () => {
    setLang('fr');
    const onChoose = vi.fn();
    render(
      <TripCompare trips={TRIPS} lockedCount={0} differentiator="d" onChoose={onChoose} onUnlock={() => {}} />,
    );
    const second = screen.getAllByRole('article')[1]!;
    fireEvent.click(within(second).getByRole('button', { name: 'Choisissez cette vire' }));
    expect(onChoose).toHaveBeenCalledWith(TRIPS[1]);
  });

  it('bascule vers le relevé comparé et revient aux cartes', () => {
    setLang('fr');
    render(
      <TripCompare trips={TRIPS} lockedCount={0} differentiator="d" onChoose={() => {}} onUnlock={() => {}} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tableau' }));
    expect(screen.getByRole('heading', { name: 'Les trois, côte à côte.' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cartes' }));
    expect(screen.getAllByRole('article')).toHaveLength(3);
  });

  it('les vires verrouillées ouvrent le paywall', () => {
    setLang('fr');
    const onUnlock = vi.fn();
    render(
      <TripCompare trips={[TRIPS[0]!]} lockedCount={2} differentiator="d" onChoose={() => {}} onUnlock={onUnlock} />,
    );
    const locked = screen.getAllByRole('button', { name: 'Débloquer les 3 trips' });
    expect(locked).toHaveLength(2);
    fireEvent.click(locked[0]!);
    expect(onUnlock).toHaveBeenCalled();
  });
});
