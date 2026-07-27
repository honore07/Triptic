import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { TripDay } from '@triptic/shared';
import { DayCards } from '../components/DayCards';
import { setLang } from '../lib/i18n';

const DAYS: TripDay[] = [
  {
    day: 2,
    title: 'Grand Ballon',
    activities: [
      { type: 'hike', time_of_day: 'morning', title: 'Montée au Grand Ballon', lat: 47.9, lng: 7.1, distance_km: 12, elevation_gain_m: 600 },
    ],
    segments: [{ distance_km: 20, duration_min: 30, mode: 'car', routed: true }],
  },
  {
    day: 1,
    title: 'Colmar → Schlucht',
    activities: [
      { type: 'drive', time_of_day: 'morning', title: 'Route des Crêtes', lat: 48.06, lng: 7.02, description: 'Cols et chaumes' },
      { type: 'camp', time_of_day: 'evening', title: 'Camping du Lac', lat: 48.06, lng: 7.02, cost_estimate: 24 },
    ],
    segments: [{ distance_km: 42.5, duration_min: 65, mode: 'car', routed: false }],
  },
];

describe('DayCards (cartes-étapes 2.2)', () => {
  it('affiche les jours triés avec activités, distances et mention estimation', () => {
    setLang('fr');
    render(<DayCards days={DAYS} selectedDay={null} onSelectDay={() => {}} />);
    const cards = screen.getAllByRole('button');
    expect(cards[0]).toHaveAccessibleName(/Jour 1/);
    expect(cards[1]).toHaveAccessibleName(/Jour 2/);
    expect(screen.getByText('Route des Crêtes')).toBeInTheDocument();
    expect(screen.getByText(/Cols et chaumes/)).toBeInTheDocument();
    expect(screen.getByText(/43 km/)).toBeInTheDocument();
    expect(screen.getByText(/estimation/)).toBeInTheDocument(); // segment non routé
    expect(screen.getByText(/24 €/)).toBeInTheDocument();
  });

  it('remonte le jour cliqué (synchro carte)', () => {
    setLang('fr');
    const onSelectDay = vi.fn();
    render(<DayCards days={DAYS} selectedDay={null} onSelectDay={onSelectDay} />);
    fireEvent.click(screen.getByRole('button', { name: /Jour 2/ }));
    expect(onSelectDay).toHaveBeenCalledWith(2);
  });

  it('met le jour sélectionné en avant (aria-pressed)', () => {
    setLang('fr');
    render(<DayCards days={DAYS} selectedDay={2} onSelectDay={() => {}} />);
    expect(screen.getByRole('button', { name: /Jour 2/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Jour 1/ })).toHaveAttribute('aria-pressed', 'false');
  });
});
