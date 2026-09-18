import { describe, expect, it, vi } from 'vitest';
import {
  AGENT_TIMEOUT_MS,
  assessPhoto,
  MIN_SCORE_WITHOUT_AGENT,
  PHOTO_RULES_PROMPT,
  PHOTO_RULES_VERSION,
  rankPlacePhotos,
} from '../agents/photoAgent.js';
import type { PhotoCandidate, PhotoFacts } from '../services/photos.js';

/** Faits Commons d'une photo 3:2 assez grande, sauf mention contraire. */
const facts = (title: string, categories: string[] = [], extra: Partial<PhotoFacts> = {}): PhotoFacts => ({
  title,
  description: '',
  categories,
  width: 4000,
  height: 2667,
  ...extra,
});

const photo = (title: string, categories: string[] = [], extra: Partial<PhotoFacts> = {}): PhotoCandidate => ({
  type: 'photo',
  url: `https://thumb.wikimedia.org/${encodeURIComponent(title)}.jpg`,
  thumb: '',
  author: 'A',
  link: '',
  source: 'commons',
  facts: facts(title, categories, extra),
});

const mockAgent = (reply: () => Promise<string>) => ({
  name: 'mock',
  complete: vi.fn(async (_opts: { system: string; messages: { content: string }[] }) => reply()),
  correct: vi.fn(),
});

describe('assessPhoto — règles déterministes', () => {
  it('écarte les hors-sujet que trahissent titre et catégories (cas réels, septembre 2026)', () => {
    expect(
      assessPhoto(
        facts('DSC01021 Jeep Cherokee, Carabinieri, Front Right', [
          'Jeep Grand Cherokee of the Carabinieri',
          '2023 Republic Day in Bolzano (Italy)',
        ]),
      ).reject,
    ).toBe('véhicule');
    expect(
      assessPhoto(facts('Z850 EMU at La Joux', ['Saint-Gervais-Vallorcine Line', 'SNCF Class Z 850'])).reject,
    ).toBe('véhicule');
    expect(assessPhoto(facts("Bœuf d'Hérens", ['Oxen in Switzerland', 'Hérens cattle'])).reject).toBe(
      'animal ou plante',
    );
    expect(
      assessPhoto(facts('Baptismal fonts Kaysersberg', ['Baptismal font of Église Sainte-Croix (Kaysersberg)']))
        .reject,
    ).toBe('intérieur');
    expect(
      assessPhoto(facts('2013-02-28 17-06-06-details-belfort', ['Reliefs in Belfort', 'Keystones in Belfort']))
        .reject,
    ).toBe('objet ou détail');
    expect(assessPhoto(facts('ISS045-E-141043 - View of Earth')).reject).toBe('vue satellite');
  });

  it('écarte les cadrages qui ne remplissent pas une carte', () => {
    expect(assessPhoto(facts('Vue du Hohneck', [], { width: 2448, height: 3264 })).reject).toBe(
      'cadrage portrait',
    );
    expect(assessPhoto(facts('Vue du Hohneck', [], { width: 800, height: 533 })).reject).toBe('trop petite');
    expect(
      assessPhoto(
        facts('2011-05-29-pano-hohneck-1', ['Landscapes of Haut-Rhin'], { width: 16517, height: 2704 }),
      ).reject,
    ).toBe('panorama trop étroit');
  });

  it('garde les vues d’ensemble ; un bâtiment seul ne passe jamais sans l’agent', () => {
    const radar = assessPhoto(
      facts('Vuedepuisleradarverslest', ['Grand Ballon'], {
        description: "Vu vers l'est depuis le radar du grand ballon",
      }),
    );
    const village = assessPhoto(facts('Vue du village de Ribeauvillé', ['Ribeauvillé', 'Landscapes of Haut-Rhin']));
    for (const view of [radar, village]) {
      expect(view.reject).toBeNull();
      expect(view.score).toBeGreaterThanOrEqual(MIN_SCORE_WITHOUT_AGENT);
    }
    const church = assessPhoto(
      facts('Saint Barthelemy church of Gérardmer', [
        'Église Saint-Barthélemy de Gérardmer',
        'Tone-mapped HDR images of churches in France',
      ]),
    );
    const townHall = assessPhoto(facts('Rochejean - mairie', ['Town hall of Rochejean'], { width: 2048, height: 1536 }));
    // Pas écartés d'office (un château dans son site reste possible)…
    expect(church.reject).toBeNull();
    // …mais jamais proposés sans le feu vert de l'agent
    expect(church.score).toBeLessThan(MIN_SCORE_WITHOUT_AGENT);
    expect(townHall.score).toBeLessThan(MIN_SCORE_WITHOUT_AGENT);
  });

  it('ignore les catégories de maintenance et ne prend pas une vue aérienne pour un oiseau', () => {
    expect(assessPhoto(facts('Lac Blanc (Orbey) 03', ['Pages with maps', 'Lac Blanc (Orbey)'])).reject).toBeNull();
    expect(assessPhoto(facts("Bird's-eye view of Colmar")).reject).toBeNull();
  });

  it('ne confond pas un nom de lieu avec un sujet écarté', () => {
    // La Grave (Hautes-Alpes), face à la Meije : pas une tombe
    expect(assessPhoto(facts('La Meije vue de La Grave', ['La Grave'])).reject).toBeNull();
  });
});

describe('rankPlacePhotos', () => {
  const hohneck = [
    photo('Tirailleurs tunisiens Hohneck', ['Hohneck', 'Military monuments and memorials in France']),
    photo('Petit Ballon depuis le Hohneck', ['Petit Ballon', 'Mountains of Haut-Rhin']),
    photo('Chalet-restaurant Hohneck', ['Hohneck', 'Buildings in La Bresse']),
    photo('Aircraft 68YD over Hohneck, Vosges-0215', ['2016 in aviation in France']),
  ];
  const bolzano = [photo('DSC01206 Landtagsgebäude Bozen 06-2023', ['Landtagsgebäude Bozen'])];

  it('sans agent : seules les photos dont les faits disent un paysage', async () => {
    const [kept] = await rankPlacePhotos([{ place: 'Hohneck', candidates: hohneck }], null);
    expect(kept?.map((p) => p.facts.title)).toEqual(['Petit Ballon depuis le Hohneck']);
  });

  it('l’agent tranche lieu par lieu, en un appel, sur les faits Commons', async () => {
    const provider = mockAgent(async () => '{"L1": [0], "L2": []}');
    const [atHohneck, atBolzano] = await rankPlacePhotos(
      [
        { place: 'Hohneck', candidates: hohneck },
        { place: 'Centre de Bolzano', candidates: bolzano },
      ],
      provider,
    );
    expect(atHohneck?.map((p) => p.facts.title)).toEqual(['Petit Ballon depuis le Hohneck']);
    // Liste vide = rien ne montre l'espace : pas de repli sur les règles
    expect(atBolzano).toEqual([]);
    expect(provider.complete).toHaveBeenCalledTimes(1);
    const sent = provider.complete.mock.calls[0]?.[0];
    expect(sent?.system).toBe(PHOTO_RULES_PROMPT);
    const listing = sent?.messages[0]?.content ?? '';
    expect(listing).toContain('L1 — Hohneck');
    expect(listing).toContain('L2 — Centre de Bolzano');
    expect(listing).toContain('Mountains of Haut-Rhin');
    expect(listing).toContain('4000×2667');
    // L'avion est écarté par les règles avant d'être montré à l'agent
    expect(listing).not.toContain('Aircraft');
  });

  it('suit l’ordre de l’agent et tolère des numéros rendus en texte', async () => {
    const views = [
      photo('Vue du village de Ribeauvillé', ['Landscapes of Haut-Rhin']),
      photo('Lac Blanc (Orbey) 03', ['Lac Blanc (Orbey)']),
    ];
    const provider = mockAgent(async () => '{"L1": ["1", "0", "1"]}');
    const [kept] = await rankPlacePhotos([{ place: 'Ribeauvillé', candidates: views }], provider);
    expect(kept?.map((p) => p.facts.title)).toEqual(['Lac Blanc (Orbey) 03', 'Vue du village de Ribeauvillé']);
  });

  it('agent en panne : les règles déterministes font foi', async () => {
    const provider = mockAgent(async () => {
      throw new Error('LLM down');
    });
    const [kept] = await rankPlacePhotos([{ place: 'Hohneck', candidates: hohneck }], provider);
    expect(kept?.map((p) => p.facts.title)).toEqual(['Petit Ballon depuis le Hohneck']);
  });

  it('agent qui ne répond jamais : repli sur les règles après le délai', async () => {
    vi.useFakeTimers();
    try {
      const provider = mockAgent(() => new Promise<string>(() => {}));
      const pending = rankPlacePhotos([{ place: 'Hohneck', candidates: hohneck }], provider);
      await vi.advanceTimersByTimeAsync(AGENT_TIMEOUT_MS);
      const [kept] = await pending;
      expect(kept?.map((p) => p.facts.title)).toEqual(['Petit Ballon depuis le Hohneck']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('lieu absent de la réponse : repli sur les règles pour ce lieu seulement', async () => {
    const provider = mockAgent(async () => '{"L2": []}');
    const [atHohneck, atBolzano] = await rankPlacePhotos(
      [
        { place: 'Hohneck', candidates: hohneck },
        { place: 'Centre de Bolzano', candidates: bolzano },
      ],
      provider,
    );
    expect(atHohneck?.map((p) => p.facts.title)).toEqual(['Petit Ballon depuis le Hohneck']);
    expect(atBolzano).toEqual([]);
  });

  it('au-delà de six lieux, plusieurs appels courts', async () => {
    const provider = mockAgent(async () => '{}');
    const places = Array.from({ length: 7 }, (_, i) => ({ place: `Lieu ${i}`, candidates: hohneck }));
    await rankPlacePhotos(places, provider);
    expect(provider.complete).toHaveBeenCalledTimes(2);
  });

  it('le prompt porte la version des règles (audit)', () => {
    expect(PHOTO_RULES_PROMPT).toContain(`version ${PHOTO_RULES_VERSION}`);
  });
});
