import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { TripProposal } from '@triptic/shared';
import { TableauCompare } from '../components/TableauCompare';
import { setLang } from '../lib/i18n';

function trip(over: Partial<TripProposal> & { title: string }): TripProposal {
  return {
    mode: 'trek',
    duration_days: 4,
    distance_km: 60,
    elevation_gain_m: 2000,
    difficulty: 'medium',
    ambiance: 'sauvage',
    summary: 'Résumé.',
    daily_distance_km: 15,
    waypoints: [],
    photo_keywords: [],
    ...over,
  };
}

const TRIPS = [
  trip({ title: 'Crête sauvage', duration_days: 4, distance_km: 62, elevation_gain_m: 2140 }),
  trip({ title: 'Vosges en douceur', duration_days: 4, distance_km: 48, elevation_gain_m: 1260 }),
  trip({ title: 'Le grand tour', duration_days: 5, distance_km: 84, elevation_gain_m: 2980 }),
];

describe('TableauCompare (planche PL.08)', () => {
  beforeEach(() => setLang('fr'));

  it('classe les voies sur l’axe choisi', () => {
    render(<TableauCompare trips={TRIPS} onChoose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Dist.' }));
    const rows = screen.getAllByRole('listitem');
    // Tri croissant sur la distance : 48 → 62 → 84
    expect(rows[0]).toHaveTextContent('Vosges en douceur');
    expect(rows[2]).toHaveTextContent('Le grand tour');
  });

  it('nomme le rang de chaque voie', () => {
    render(<TableauCompare trips={TRIPS} onChoose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Dist.' }));
    const rows = screen.getAllByRole('listitem');
    expect(within(rows[0] as HTMLElement).getByText('Le plus court')).toBeInTheDocument();
    expect(within(rows[2] as HTMLElement).getByText('Le plus long')).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).getByText('Médian')).toBeInTheDocument();
  });

  it('calcule l’écart réel au plus sobre', () => {
    render(<TableauCompare trips={TRIPS} onChoose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Dist.' }));
    // 84 vs 48 = +75 % ; la plus courte affiche un tiret
    expect(screen.getByText('+75 %')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('le budget parle de prix, pas de longueur', () => {
    const withBudget = TRIPS.map((tr, i) =>
      ({ ...tr, budget: { total_eur: [100 + i * 50, 200 + i * 50] } }) as TripProposal,
    );
    render(<TableauCompare trips={withBudget} onChoose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Budget' }));
    expect(screen.getByText('Le moins cher')).toBeInTheDocument();
    expect(screen.getByText('Le plus cher')).toBeInTheDocument();
  });

  it('ouvre la voie sélectionnée', () => {
    const onChoose = vi.fn();
    render(<TableauCompare trips={TRIPS} onChoose={onChoose} />);
    fireEvent.click(screen.getByRole('button', { name: /Le grand tour/ }));
    fireEvent.click(screen.getByRole('button', { name: /Ouvrir Le grand tour/ }));
    expect(onChoose).toHaveBeenCalledWith(TRIPS[2]);
  });
});
