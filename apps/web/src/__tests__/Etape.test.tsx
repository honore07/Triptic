import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { TripDay } from '@triptic/shared';
import { Etape } from '../components/Etape';
import { setLang } from '../lib/i18n';

const DAY: TripDay = {
  day: 2,
  title: 'Crête du Hohneck',
  activities: [
    {
      type: 'hike',
      time_of_day: 'morning',
      title: 'Montée au Hohneck',
      lat: 48.03,
      lng: 7.0,
      distance_km: 9,
      elevation_gain_m: 640,
    },
    {
      type: 'camp',
      time_of_day: 'evening',
      title: 'Bivouac au lac',
      lat: 48.02,
      lng: 7.01,
      cost_estimate: 12,
    },
  ],
  segments: [{ distance_km: 18, duration_min: 370, mode: 'foot', routed: true }],
};

describe('Étape (planche PL.11)', () => {
  beforeEach(() => setLang('fr'));

  it('donne le relevé chiffré de la journée', () => {
    render(<Etape day={DAY} />);
    expect(screen.getByRole('heading', { name: 'Crête du Hohneck' })).toBeInTheDocument();
    expect(screen.getByText('18 km')).toBeInTheDocument();
    expect(screen.getByText('640 m')).toBeInTheDocument();
    expect(screen.getByText('6 h 10')).toBeInTheDocument(); // 370 min, jamais « 370 min »
  });

  it('date la journée à partir du départ du trip', () => {
    render(<Etape day={DAY} startDate="2026-06-08" />);
    // Jour 2 = 9 juin
    expect(screen.getByText(/9 juin/)).toBeInTheDocument();
  });

  it('sans date de départ, aucune date inventée', () => {
    render(<Etape day={DAY} />);
    expect(screen.queryByText(/juin/)).not.toBeInTheDocument();
  });

  it('trace le profil sur les seules montées réelles', () => {
    render(<Etape day={DAY} />);
    expect(screen.getByText('640 m max')).toBeInTheDocument();
    // Le bivouac n'a pas de dénivelé : il n'entre pas dans le profil
    const bars = screen.getAllByRole('listitem');
    expect(bars.some((b) => b.textContent?.includes('Montée au Hohneck'))).toBe(true);
  });

  it('déroule les temps forts avec leur moment', () => {
    render(<Etape day={DAY} />);
    expect(screen.getByText('Bivouac au lac')).toBeInTheDocument();
    expect(screen.getByText(/soir · Nuit/)).toBeInTheDocument();
    expect(screen.getByText('12 €')).toBeInTheDocument();
  });

  it('une journée sans montée n’affiche pas de profil vide', () => {
    const flat: TripDay = {
      ...DAY,
      activities: [{ ...DAY.activities[1]!, elevation_gain_m: undefined }],
    };
    render(<Etape day={flat} />);
    expect(screen.queryByText(/max/)).not.toBeInTheDocument();
  });

  it('affiche la bande heure par heure quand la prévision la porte (PL.11)', () => {
    setLang('fr');
    render(
      <Etape
        day={DAY}
        forecast={{
          weather_code: 2,
          temp_min_c: 11,
          temp_max_c: 21,
          precipitation_mm: 2,
          precipitation_probability: 40,
          wind_max_kmh: 20,
          hours: [
            { hour: 6, weather_code: 2, temp_c: 11, precipitation_probability: 10, wind_kmh: 9 },
            { hour: 14, weather_code: 61, temp_c: 21, precipitation_probability: 80, wind_kmh: 19 },
          ],
        }}
      />,
    );
    const band = screen.getByRole('list', { name: 'Météo heure par heure' });
    expect(band).toHaveTextContent('06 h');
    expect(band).toHaveTextContent('14 h');
    expect(band).toHaveTextContent('80 %');
  });

  it('sans heures : pas de bande, rien de simulé', () => {
    setLang('fr');
    render(<Etape day={DAY} forecast={null} />);
    expect(screen.queryByRole('list', { name: 'Météo heure par heure' })).not.toBeInTheDocument();
  });
});
