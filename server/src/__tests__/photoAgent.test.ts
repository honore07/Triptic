import { describe, expect, it, vi } from 'vitest';
import {
  filterUsefulPhotos,
  isObviouslyOffTopic,
  mediaTitle,
} from '../agents/photoAgent.js';
import type { PlaceMedia } from '../services/photos.js';

const media = (file: string): PlaceMedia => ({
  type: 'photo',
  url: `https://upload.wikimedia.org/thumb/960px-${file}`,
  thumb: '',
  author: 'A',
  link: '',
  source: 'commons',
});

describe('mediaTitle', () => {
  it('rend lisible le nom de fichier Commons', () => {
    expect(mediaTitle(media('Col_Petit_Ballon_2024.jpg'))).toBe('Col Petit Ballon 2024');
    expect(mediaTitle(media('Vu_de_Wasserbourg_depuis_le_Buchwald.jpg'))).toBe(
      'Vu de Wasserbourg depuis le Buchwald',
    );
  });

  it('décode les caractères échappés', () => {
    expect(mediaTitle(media('Paysage_au_Buchwald_%28Wasserbourg%29.jpg'))).toBe(
      'Paysage au Buchwald (Wasserbourg)',
    );
  });
});

describe('isObviouslyOffTopic', () => {
  it('écarte les sujets hors-lieu, en plusieurs langues', () => {
    // Cas réellement rencontrés dans la galerie du Petit Ballon
    expect(isObviouslyOffTopic('2010 Rally France-Alsace - Michał Kościuszko')).toBe(true);
    expect(isObviouslyOffTopic('Kever op margriet')).toBe(true); // scarabée (nl)
    expect(isObviouslyOffTopic('Bruine vlinder op gele bloem')).toBe(true); // papillon
    expect(isObviouslyOffTopic('Hagedis in jeneverbes')).toBe(true); // lézard
    expect(isObviouslyOffTopic('Blason de Wasserbourg')).toBe(true);
    // Photos NASA géotaguées au sol : on ne reconnaît aucun lieu dessus
    expect(isObviouslyOffTopic('ISS045-E-141043 - View of Earth')).toBe(true);
  });

  it('laisse passer paysages, villages et patrimoine', () => {
    expect(isObviouslyOffTopic('Col Petit Ballon 2024')).toBe(false);
    expect(isObviouslyOffTopic('Vu de Wasserbourg depuis le Buchwald')).toBe(false);
    expect(isObviouslyOffTopic('Munster CourAbbaye 02')).toBe(false);
    expect(isObviouslyOffTopic('Hohneck von Südosten')).toBe(false);
  });
});

describe('filterUsefulPhotos', () => {
  const gallery = [
    media('Col_Petit_Ballon_2024.jpg'),
    media('2010_Rally_France-Alsace.jpg'),
    media('Velo_rose_enfant.jpg'),
    media('Vu_de_Wasserbourg.jpg'),
  ];

  it('applique le pré-filtre même sans agent LLM', async () => {
    const kept = await filterUsefulPhotos('Petit Ballon', gallery, null);
    expect(kept.map(mediaTitle)).toEqual([
      'Col Petit Ballon 2024',
      'Velo rose enfant',
      'Vu de Wasserbourg',
    ]);
  });

  it('laisse l’agent écarter ce que le pré-filtre ne voit pas', async () => {
    const provider = {
      name: 'mock',
      complete: vi.fn(
        async (_opts: { messages: { content: string }[] }) =>
          '{"keep":[0,2],"rejected":[{"n":1,"why":"objet isolé"}]}',
      ),
      correct: vi.fn(),
    };
    const kept = await filterUsefulPhotos('Petit Ballon', gallery, provider);
    expect(kept.map(mediaTitle)).toEqual(['Col Petit Ballon 2024', 'Vu de Wasserbourg']);
    // Le prompt reçoit bien le lieu et les titres numérotés
    const sent = provider.complete.mock.calls[0]?.[0];
    expect(sent?.messages[0]?.content).toContain('Petit Ballon');
    expect(sent?.messages[0]?.content).toContain('0. Col Petit Ballon 2024');
  });

  it('agent en panne : on garde le pré-filtre plutôt qu’un carrousel vide', async () => {
    const provider = {
      name: 'mock',
      complete: vi.fn(async () => {
        throw new Error('LLM down');
      }),
      correct: vi.fn(),
    };
    const kept = await filterUsefulPhotos('Petit Ballon', gallery, provider);
    expect(kept).toHaveLength(3);
  });

  it('verdict qui rejette tout : suspect, on retombe sur le pré-filtre', async () => {
    const provider = {
      name: 'mock',
      complete: vi.fn(async () => '{"keep":[],"rejected":[]}'),
      correct: vi.fn(),
    };
    const kept = await filterUsefulPhotos('Petit Ballon', gallery, provider);
    expect(kept).toHaveLength(3);
  });
});
