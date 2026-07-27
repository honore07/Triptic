import { describe, expect, it } from 'vitest';
import type { TripDay } from '@triptic/shared';
import { activityFromPlace, addActivityToDay, EXPLORE_CHIPS } from '../lib/explore';

const PLACE = {
  id: 'p1',
  name: 'Ferme-auberge du Kastelberg',
  kind: 'restaurant' as const,
  lat: 48.02,
  lng: 7.03,
  notoriety: 40,
  summary: 'Repas marcaire',
};

const DAYS: TripDay[] = [
  {
    day: 1,
    title: 'Crêtes',
    activities: [
      { type: 'hike', time_of_day: 'morning', title: 'Hohneck', lat: 48.04, lng: 7.01 },
      { type: 'camp', time_of_day: 'evening', title: 'Refuge', lat: 48.02, lng: 7.03 },
    ],
  },
];

describe('activityFromPlace (4.2 — ajout en 1 tap)', () => {
  it('mappe les kinds vers les types d’activité (resto → meal, refuge → camp)', () => {
    expect(activityFromPlace(PLACE).type).toBe('meal');
    expect(activityFromPlace({ ...PLACE, kind: 'refuge' }).type).toBe('camp');
    expect(activityFromPlace({ ...PLACE, kind: 'lake' }).type).toBe('visit');
  });

  it('garde le lien vers la base places (place_id) et le résumé', () => {
    const activity = activityFromPlace(PLACE);
    expect(activity.place_id).toBe('p1');
    expect(activity.description).toBe('Repas marcaire');
  });
});

describe('addActivityToDay', () => {
  it('insère avant la nuit (le camp reste en fin de journée)', () => {
    const days = addActivityToDay(DAYS, 1, activityFromPlace(PLACE));
    expect(days[0]!.activities.map((a) => a.type)).toEqual(['hike', 'meal', 'camp']);
  });

  it('ajoute une nuit en fin de journée', () => {
    const days = addActivityToDay(DAYS, 1, activityFromPlace({ ...PLACE, kind: 'camp' }));
    expect(days[0]!.activities[2]!.type).toBe('camp');
    expect(days[0]!.activities).toHaveLength(3);
  });

  it('ne touche pas les autres jours', () => {
    const twoDays = [...DAYS, { day: 2, title: 'Suite', activities: DAYS[0]!.activities }];
    const days = addActivityToDay(twoDays, 2, activityFromPlace(PLACE));
    expect(days[0]!.activities).toHaveLength(2);
    expect(days[1]!.activities).toHaveLength(3);
  });
});

describe('EXPLORE_CHIPS', () => {
  it('chaque puce est liée à des kinds stricts non vides', () => {
    for (const chip of EXPLORE_CHIPS) {
      expect(chip.kinds.length).toBeGreaterThan(0);
    }
  });
});
