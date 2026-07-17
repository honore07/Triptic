import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { TripProposal } from '@triptic/shared';
import { TripCard } from '../components/TripCard';
import { setLang } from '../lib/i18n';

const TRIP: TripProposal = {
  title: 'Crêtes des Vosges',
  mode: 'trek',
  duration_days: 3,
  distance_km: 55,
  elevation_gain_m: 2100,
  difficulty: 'medium',
  ambiance: 'sauvage',
  summary: 'Trois jours sur les crêtes entre lacs et chaumes.',
  daily_distance_km: 18,
  waypoints: [
    { name: 'Col de la Schlucht', lat: 48.0631, lng: 7.0209, day: 1, kind: 'start' },
    { name: 'Grand Ballon', lat: 47.9014, lng: 7.0994, day: 3, kind: 'end' },
  ],
  photo_keywords: ['vosges', 'trek'],
};

describe('TripCard', () => {
  it('renders title, mode, difficulty and key metrics (fr)', () => {
    setLang('fr');
    render(<TripCard trip={TRIP} onChoose={() => {}} />);
    expect(screen.getByText('Crêtes des Vosges')).toBeInTheDocument();
    expect(screen.getByText('Trek')).toBeInTheDocument();
    expect(screen.getByText('Modéré')).toBeInTheDocument();
    expect(screen.getByText('55 km')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choisir ce trip' })).toBeInTheDocument();
  });

  it('calls onChoose with the trip', () => {
    setLang('fr');
    const onChoose = vi.fn();
    render(<TripCard trip={TRIP} onChoose={onChoose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Choisir ce trip' }));
    expect(onChoose).toHaveBeenCalledWith(TRIP);
  });

  it('renders the photo with a descriptive alt when photo_url is set', () => {
    setLang('fr');
    render(<TripCard trip={{ ...TRIP, photo_url: 'https://images.unsplash.com/x.jpg' }} onChoose={() => {}} />);
    expect(screen.getByAltText('Crêtes des Vosges — sauvage')).toBeInTheDocument();
  });

  it('translates to German', () => {
    setLang('de');
    render(<TripCard trip={TRIP} onChoose={() => {}} />);
    expect(screen.getByRole('button', { name: 'Diesen Trip wählen' })).toBeInTheDocument();
    setLang('fr');
  });
});
