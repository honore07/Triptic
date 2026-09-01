import { describe, expect, it } from 'vitest';
import type { ShortlistPlace, TripDay, TripProposal } from '@triptic/shared';
import { validateDays, validateTrips } from '../validate.js';

/** Une journée plausible : deux activités reliées par un segment routé. */
function day(n: number, opts: { km?: number; gain?: number; mode?: 'foot' | 'bike' | 'car' } = {}): TripDay {
  return {
    day: n,
    title: `Jour ${n}`,
    activities: [
      { type: 'hike', time_of_day: 'morning', title: 'Munster', lat: 48.041, lng: 7.137 },
      { type: 'visit', time_of_day: 'afternoon', title: 'Petit Ballon', lat: 47.984, lng: 7.145 },
    ],
    segments: [
      {
        distance_km: opts.km ?? 15,
        duration_min: 240,
        mode: opts.mode ?? 'foot',
        routed: true,
        elevation_gain_m: opts.gain ?? 600,
      },
    ],
  };
}

function trip(over: Partial<TripProposal> = {}): TripProposal {
  return {
    title: 'Crêtes des Vosges',
    mode: 'trek',
    duration_days: 3,
    distance_km: 45,
    elevation_gain_m: 1800,
    difficulty: 'medium',
    ambiance: 'sauvage',
    summary: 'Trois jours sur les crêtes.',
    daily_distance_km: 15,
    waypoints: [
      { name: 'Munster', lat: 48.041, lng: 7.137, day: 1, kind: 'start' },
      { name: 'Guebwiller', lat: 47.907, lng: 7.213, day: 3, kind: 'end' },
    ],
    days: [day(1), day(2), day(3)],
    ...over,
  } as TripProposal;
}

describe('validateTrips — journées infaisables', () => {
  it('valide trois propositions réalistes', () => {
    expect(validateTrips([trip(), trip(), trip()], { physicalLevel: 3 })).toEqual([]);
  });

  it('bloque une journée de marche au-delà du réalisable', () => {
    const t = trip({ days: [day(1), day(2, { km: 47 })] });
    const issues = validateTrips([t], {});
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('jour 2');
    expect(issues[0]).toContain('47 km');
  });

  it('laisse passer 47 km à vélo — le seuil dépend du mode du segment', () => {
    const t = trip({ mode: 'bikepacking', days: [day(1, { km: 47, mode: 'bike' })] });
    expect(validateTrips([t], {})).toEqual([]);
  });

  it('additionne les segments d\'une même journée avant de conclure', () => {
    const heavy: TripDay = {
      ...day(1),
      segments: [
        { distance_km: 20, duration_min: 300, mode: 'foot', routed: true },
        { distance_km: 20, duration_min: 300, mode: 'foot', routed: true },
      ],
    };
    const issues = validateTrips([trip({ days: [heavy] })], {});
    expect(issues[0]).toContain('40 km');
  });

  it('retombe sur les activités quand le routing n\'a rien produit', () => {
    const noSegments: TripDay = {
      day: 1,
      title: 'Jour 1',
      activities: [
        { type: 'hike', time_of_day: 'morning', title: 'A', lat: 48, lng: 7, distance_km: 50 },
      ],
    };
    expect(validateTrips([trip({ days: [noSegments] })], {})).toHaveLength(1);
  });
});

describe('validateTrips — dénivelé selon le niveau physique', () => {
  it('bloque 3000 m pour un niveau 2', () => {
    const t = trip({ days: [day(1, { gain: 3000 })] });
    const issues = validateTrips([t], { physicalLevel: 2 });
    expect(issues[0]).toContain('3000 m');
  });

  it('laisse passer le même dénivelé pour un niveau 5', () => {
    const t = trip({ days: [day(1, { gain: 3000 })] });
    expect(validateTrips([t], { physicalLevel: 5 })).toEqual([]);
  });

  it('ne conclut rien sans niveau déclaré', () => {
    const t = trip({ days: [day(1, { gain: 3000 })] });
    expect(validateTrips([t], {})).toEqual([]);
  });
});

describe('validateTrips — les 3 propositions restent comparables', () => {
  it('bloque des modes différents', () => {
    const issues = validateTrips([trip(), trip({ mode: 'roadtrip' })], {});
    expect(issues.some((i) => i.includes('mode'))).toBe(true);
  });

  it('bloque un écart de durée de plus de 2 jours', () => {
    const issues = validateTrips([trip({ duration_days: 3 }), trip({ duration_days: 7 })], {});
    expect(issues.some((i) => i.includes('4 jours'))).toBe(true);
  });

  it('accepte un écart de 2 jours — c\'est la variation attendue', () => {
    expect(validateTrips([trip({ duration_days: 3 }), trip({ duration_days: 5 })], {})).toEqual([]);
  });

  it('bloque deux propositions dans des régions sans rapport', () => {
    // Gavarnie (Pyrénées) : ~800 km des Vosges. Chamonix (~240 km) passerait,
    // et c'est voulu — le seuil vise « pas le même voyage », pas « pas la même vallée ».
    const pyrenees = trip({
      days: [
        {
          day: 1,
          title: 'Jour 1',
          activities: [
            { type: 'hike', time_of_day: 'morning', title: 'Gavarnie', lat: 42.735, lng: -0.009 },
          ],
        },
      ],
    });
    const issues = validateTrips([trip(), pyrenees], {});
    expect(issues.some((i) => i.includes('éloignées'))).toBe(true);
  });
});

describe('validateTrips — coordonnées inventées', () => {
  const shortlist: ShortlistPlace[] = [
    { name: 'Petit Ballon', lat: 47.984, lng: 7.145, kind: 'peak', notoriety: 60 },
  ];

  it('repère une activité placée loin du lieu réel qui porte son nom', () => {
    const drifted = trip({
      days: [
        {
          day: 1,
          title: 'Jour 1',
          activities: [
            // Même nom, mais posé près de Nancy : ~120 km trop loin.
            { type: 'visit', time_of_day: 'morning', title: 'Petit Ballon', lat: 48.69, lng: 6.18 },
          ],
        },
      ],
    });
    const issues = validateTrips([drifted], { shortlist });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('Petit Ballon');
  });

  it('ignore les accents et la casse pour rapprocher les noms', () => {
    const withAccents: ShortlistPlace[] = [
      { name: 'Château du Haut-Kœnigsbourg', lat: 48.249, lng: 7.344, kind: 'castle', notoriety: 90 },
    ];
    const drifted = trip({
      days: [
        {
          day: 1,
          title: 'Jour 1',
          activities: [
            { type: 'visit', time_of_day: 'morning', title: 'chateau du haut-kœnigsbourg', lat: 45.9, lng: 6.8 },
          ],
        },
      ],
    });
    expect(validateTrips([drifted], { shortlist: withAccents })).toHaveLength(1);
  });

  it('ne dit rien quand le nom est inconnu de la base — pas de faux positif', () => {
    const unknown = trip({
      days: [
        {
          day: 1,
          title: 'Jour 1',
          activities: [
            { type: 'visit', time_of_day: 'morning', title: 'Cabane secrète', lat: 48.69, lng: 6.18 },
          ],
        },
      ],
    });
    expect(validateTrips([unknown], { shortlist })).toEqual([]);
  });

  it('retient l\'homonyme le plus proche plutôt que le premier venu', () => {
    const homonyms: ShortlistPlace[] = [
      { name: 'Le Lac', lat: 45.0, lng: 6.0, kind: 'lake', notoriety: 40 },
      { name: 'Le Lac', lat: 48.04, lng: 7.14, kind: 'lake', notoriety: 40 },
    ];
    const t = trip({
      days: [
        {
          day: 1,
          title: 'Jour 1',
          activities: [
            { type: 'visit', time_of_day: 'morning', title: 'Le Lac', lat: 48.041, lng: 7.137 },
          ],
        },
      ],
    });
    expect(validateTrips([t], { shortlist: homonyms })).toEqual([]);
  });
});

describe('validateTrips — contrat de sortie', () => {
  it('plafonne à 3 remarques', () => {
    const broken = trip({
      days: [day(1, { km: 99 }), day(2, { km: 99 }), day(3, { km: 99 }), day(4, { km: 99 })],
    });
    expect(validateTrips([broken], {}).length).toBeLessThanOrEqual(3);
  });

  it('accepte une liste vide sans lever', () => {
    expect(validateTrips([], {})).toEqual([]);
  });
});

describe('validateDays — édition d\'un trip existant', () => {
  it('applique les seuils du mode passé', () => {
    expect(validateDays([day(1, { km: 47 })], 'trek')).toHaveLength(1);
    expect(validateDays([day(1, { km: 47, mode: 'bike' })], 'bikepacking')).toEqual([]);
  });

  it('ne juge pas la comparabilité — il n\'y a qu\'un trip', () => {
    expect(validateDays([day(1)], 'trek')).toEqual([]);
  });
});
