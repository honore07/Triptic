import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { TripDay } from '@triptic/shared';
import { DayEditor } from '../components/DayEditor';
import { setLang } from '../lib/i18n';

const DAYS: TripDay[] = [
  {
    day: 1,
    title: 'Crêtes',
    activities: [
      { type: 'drive', time_of_day: 'morning', title: 'Route des Crêtes', lat: 48.06, lng: 7.02 },
      { type: 'hike', time_of_day: 'afternoon', title: 'Hohneck', lat: 48.04, lng: 7.01 },
      { type: 'camp', time_of_day: 'evening', title: 'Refuge', lat: 48.02, lng: 7.03 },
    ],
  },
];

describe('DayEditor (édition manuelle 3.1)', () => {
  it('réordonne une activité vers le haut', () => {
    setLang('fr');
    const onChange = vi.fn();
    render(<DayEditor days={DAYS} busy={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Monter — Hohneck/ }));
    const days = onChange.mock.calls[0]![0] as TripDay[];
    expect(days[0]!.activities.map((a) => a.title)).toEqual([
      'Hohneck',
      'Route des Crêtes',
      'Refuge',
    ]);
  });

  it('supprime une activité (mais jamais la dernière du jour)', () => {
    setLang('fr');
    const onChange = vi.fn();
    render(<DayEditor days={DAYS} busy={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Supprimer — Refuge/ }));
    const days = onChange.mock.calls[0]![0] as TripDay[];
    expect(days[0]!.activities).toHaveLength(2);
  });

  it('édite le titre d’une activité via le formulaire inline', () => {
    setLang('fr');
    const onChange = vi.fn();
    render(<DayEditor days={DAYS} busy={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /^Modifier — Hohneck/ }));
    fireEvent.change(screen.getByLabelText('Titre'), { target: { value: 'Petit Hohneck' } });
    const days = onChange.mock.calls[0]![0] as TripDay[];
    expect(days[0]!.activities[1]!.title).toBe('Petit Hohneck');
  });

  it('ajoute une activité avec les coordonnées de la précédente', () => {
    setLang('fr');
    const onChange = vi.fn();
    render(<DayEditor days={DAYS} busy={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Ajouter une activité/ }));
    const days = onChange.mock.calls[0]![0] as TripDay[];
    expect(days[0]!.activities).toHaveLength(4);
    expect(days[0]!.activities[3]).toMatchObject({ lat: 48.02, lng: 7.03 });
  });
});
