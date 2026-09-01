import { describe, expect, it } from 'vitest';
import { filtersFromText } from '../services/exploreFilters.js';

describe('filtersFromText — envies courantes', () => {
  it('comprend l\'exemple du prompt d\'origine', () => {
    const kinds = filtersFromText('on veut se baigner puis manger une tarte flambée');
    expect(kinds).toContain('lake');
    expect(kinds).toContain('restaurant');
  });

  it('reconnaît une envie de point de vue', () => {
    expect(filtersFromText('un point de vue tranquille')).toContain('viewpoint');
  });

  it('reconnaît une envie de randonnée', () => {
    expect(filtersFromText('une belle rando en boucle')).toContain('trail');
  });

  it('reconnaît où dormir', () => {
    expect(filtersFromText('où dormir ce soir en van')).toContain('camp');
  });
});

describe('filtersFromText — les trois langues', () => {
  it('anglais', () => {
    const kinds = filtersFromText('a swim in a lake then a good dinner');
    expect(kinds).toContain('lake');
    expect(kinds).toContain('restaurant');
  });

  it('allemand', () => {
    const kinds = filtersFromText('wandern und danach ein Wasserfall');
    expect(kinds).toContain('trail');
    expect(kinds).toContain('waterfall');
  });

  it('ignore accents et casse', () => {
    expect(filtersFromText('CHÂTEAU et musée')).toEqual(
      expect.arrayContaining(['castle', 'museum']),
    );
  });
});

describe('filtersFromText — pas de faux positifs', () => {
  // Ce sont les pièges qui ont fait abandonner le matching par sous-chaîne.
  it('« barrage » n\'est pas un bar', () => {
    expect(filtersFromText('le barrage de Kruth')).not.toContain('bar');
  });

  it('« colline » n\'est pas un col', () => {
    expect(filtersFromText('une colline douce')).not.toContain('pass');
  });

  it('l\'anglais « see » n\'est pas le lac allemand', () => {
    expect(filtersFromText('I want to see something nice')).not.toContain('lake');
  });

  it('« placard » n\'est pas un lac', () => {
    expect(filtersFromText('placard')).not.toContain('lake');
  });

  it('rend une liste vide sur une envie hors vocabulaire', () => {
    expect(filtersFromText('quelque chose de sympa')).toEqual([]);
  });
});

describe('filtersFromText — contrat', () => {
  it('gère les préfixes déclarés', () => {
    expect(filtersFromText('la baignade')).toContain('lake');
    expect(filtersFromText('on se baigne')).toContain('lake');
    expect(filtersFromText('randonner')).toContain('trail');
  });

  it('plafonne à 4 kinds', () => {
    const kinds = filtersFromText('lac cascade sommet col gorge glacier panorama refuge camping');
    expect(kinds.length).toBeLessThanOrEqual(4);
  });

  it('accepte une chaîne vide sans lever', () => {
    expect(filtersFromText('')).toEqual([]);
  });
});
