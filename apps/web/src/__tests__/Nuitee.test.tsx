import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { TripDay } from '@triptic/shared';
import { Nuitee } from '../components/Nuitee';
import { setLang } from '../lib/i18n';
import * as api from '../lib/api';

vi.mock('../lib/api', () => ({ searchArea: vi.fn() }));
const searchArea = vi.mocked(api.searchArea);

const DAY: TripDay = {
  day: 3,
  title: 'Crête du Hohneck',
  activities: [
    {
      type: 'hike',
      time_of_day: 'afternoon',
      title: 'Arrivée au Hohneck',
      lat: 48.03,
      lng: 7.0,
    },
  ],
  segments: [{ distance_km: 18, duration_min: 370, mode: 'foot', routed: true }],
};

const SPOTS = [
  {
    id: 'p1',
    name: 'Aire de la Vallée de Munster',
    kind: 'camp' as const,
    lat: 48.04,
    lng: 7.05,
    notoriety: 40,
    summary: 'Sol plat, borne 24 h/24.',
    travel_min: 12,
  },
  {
    id: 'p2',
    name: 'Refuge du Firstmiss',
    kind: 'refuge' as const,
    lat: 48.02,
    lng: 7.02,
    notoriety: 55,
    summary: null,
    travel_min: 25,
  },
];

describe('Nuitée (planche PL.10)', () => {
  beforeEach(() => {
    setLang('fr');
    searchArea.mockReset();
  });

  it('cherche les emplacements autour de la fin d’étape, au bon mode', async () => {
    searchArea.mockResolvedValue(SPOTS);
    render(<Nuitee day={DAY} onAdd={() => {}} />);
    await waitFor(() => expect(searchArea).toHaveBeenCalled());
    const [bbox, kinds, from, mode] = searchArea.mock.calls[0]!;
    expect(kinds).toEqual(['camp', 'refuge']);
    expect(from).toEqual({ lat: 48.03, lng: 7.0 });
    expect(mode).toBe('foot'); // le mode de la journée, pas la voiture par défaut
    expect(bbox.north).toBeGreaterThan(bbox.south);
  });

  it('affiche les emplacements avec leur temps de trajet réel', async () => {
    searchArea.mockResolvedValue(SPOTS);
    render(<Nuitee day={DAY} onAdd={() => {}} />);
    expect(await screen.findByText('Aire de la Vallée de Munster')).toBeInTheDocument();
    expect(screen.getByText('12 min')).toBeInTheDocument();
    expect(screen.getByText('Sol plat, borne 24 h/24.')).toBeInTheDocument();
  });

  it('filtre par nature d’emplacement', async () => {
    searchArea.mockResolvedValue(SPOTS);
    render(<Nuitee day={DAY} onAdd={() => {}} />);
    await screen.findByText('Aire de la Vallée de Munster');
    fireEvent.click(screen.getByRole('button', { name: 'Refuge' }));
    expect(screen.queryByText('Aire de la Vallée de Munster')).not.toBeInTheDocument();
    expect(screen.getByText('Refuge du Firstmiss')).toBeInTheDocument();
  });

  it('pose la nuit comme activité du soir', async () => {
    searchArea.mockResolvedValue(SPOTS);
    const onAdd = vi.fn();
    render(<Nuitee day={DAY} onAdd={onAdd} />);
    await screen.findByText('Aire de la Vallée de Munster');
    fireEvent.click(screen.getAllByRole('button', { name: 'Poser la nuit ici' })[0]!);
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'camp', time_of_day: 'evening' }),
    );
  });

  it('base injoignable : le dit, plutôt qu’une liste vide trompeuse', async () => {
    searchArea.mockRejectedValue(new Error('offline'));
    render(<Nuitee day={DAY} onAdd={() => {}} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/pas joignable/);
    expect(screen.queryByText(/Aucun emplacement connu/)).not.toBeInTheDocument();
  });
});
