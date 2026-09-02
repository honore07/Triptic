import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import {
  clearGalleryCache,
  coverAnchors,
  diversifyByAuthor,
  findCommonsMedia,
  findDayPhotos,
  findPlacePhotos,
  findTripCover,
  type PlaceMedia,
} from '../services/photos.js';

const mockProvider = {
  name: 'mock',
  complete: async () => '{}',
  correct: async () => '{}',
};

const unsplashPayload = {
  results: [
    {
      urls: { regular: 'https://img/1-regular', thumb: 'https://img/1-thumb' },
      links: { html: 'https://unsplash.com/photos/1' },
      user: { name: 'Ada L.' },
    },
  ],
};

describe('findPlacePhotos', () => {
  beforeEach(() => {
    clearGalleryCache();
    process.env['UNSPLASH_ACCESS_KEY'] = 'test-key';
    delete process.env['PEXELS_API_KEY'];
  });
  afterEach(() => {
    delete process.env['UNSPLASH_ACCESS_KEY'];
    vi.unstubAllGlobals();
  });

  it('mappe les photos Unsplash avec leur crédit', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(unsplashPayload), { status: 200 })),
    );
    const media = await findPlacePhotos('Colmar');
    expect(media).toHaveLength(1);
    expect(media[0]).toMatchObject({
      type: 'photo',
      url: 'https://img/1-regular',
      thumb: 'https://img/1-thumb',
      author: 'Ada L.',
      link: 'https://unsplash.com/photos/1',
      source: 'unsplash',
    });
  });

  it('sert le cache au 2e appel (quota Unsplash 50 req/h)', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify(unsplashPayload), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await findPlacePhotos('Munster');
    await findPlacePhotos('Munster');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('ajoute les vidéos Pexels en fin de galerie, en MP4 SD', async () => {
    process.env['PEXELS_API_KEY'] = 'pexels-key';
    const videoPayload = {
      videos: [
        {
          url: 'https://pexels.com/video/9',
          image: 'https://vid/9-poster.jpg',
          user: { name: 'Kino' },
          video_files: [
            { link: 'https://vid/9-hd.mp4', quality: 'hd', file_type: 'video/mp4' },
            { link: 'https://vid/9-sd.mp4', quality: 'sd', file_type: 'video/mp4' },
          ],
        },
      ],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.includes('/videos/search')
          ? new Response(JSON.stringify(videoPayload), { status: 200 })
          : url.includes('unsplash')
            ? new Response(JSON.stringify(unsplashPayload), { status: 200 })
            : new Response(JSON.stringify({ photos: [] }), { status: 200 }),
      ),
    );
    const media = await findPlacePhotos('Colmar videos');
    expect(media[0]?.type).toBe('photo');
    const video = media.at(-1);
    expect(video).toMatchObject({
      type: 'video',
      // SD retenu plutôt que HD : données mobiles
      url: 'https://vid/9-sd.mp4',
      thumb: 'https://vid/9-poster.jpg',
      author: 'Kino',
      source: 'pexels',
    });
    delete process.env['PEXELS_API_KEY'];
  });

  it('ignore une vidéo sans fichier MP4 exploitable', async () => {
    process.env['PEXELS_API_KEY'] = 'pexels-key';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.includes('/videos/search')
          ? new Response(
              JSON.stringify({
                videos: [{ url: 'x', image: 'y', video_files: [{ file_type: 'video/webm' }] }],
              }),
              { status: 200 },
            )
          : new Response(JSON.stringify({ results: [], photos: [] }), { status: 200 }),
      ),
    );
    expect(await findPlacePhotos('Sans mp4')).toEqual([]);
    delete process.env['PEXELS_API_KEY'];
  });

  it('avec des coordonnées : Commons prime et court-circuite les mots-clés', async () => {
    const commonsPayload = {
      query: {
        pages: {
          '1': {
            title: 'File:Col Petit Ballon 2024.jpg',
            imageinfo: [
              {
                thumburl: 'https://commons/petit-ballon-900.jpg',
                descriptionurl: 'https://commons.wikimedia.org/wiki/File:Col.jpg',
                extmetadata: {
                  Artist: { value: '<a href="/wiki/User:X">Jesper B.</a>' },
                  LicenseShortName: { value: 'CC BY-SA 4.0' },
                },
              },
            ],
          },
        },
      },
    };
    const fetchMock = vi.fn(async (url: string) =>
      url.includes('commons.wikimedia.org')
        ? new Response(JSON.stringify(commonsPayload), { status: 200 })
        : new Response(JSON.stringify(unsplashPayload), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const media = await findPlacePhotos('Petit Ballon', 10, { lat: 47.9889, lng: 7.1247 });
    expect(media).toHaveLength(1);
    expect(media[0]).toMatchObject({
      type: 'photo',
      url: 'https://commons/petit-ballon-900.jpg',
      author: 'Jesper B.', // HTML du champ Artist retiré
      license: 'CC BY-SA 4.0',
      source: 'commons',
    });
    // Aucun appel Unsplash/Pexels : c'est eux qui renvoyaient des baudruches
    expect(fetchMock.mock.calls.every(([u]) => String(u).includes('commons'))).toBe(true);
  });

  it('répartit la galerie entre auteurs plutôt qu’un seul reportage', () => {
    const of = (author: string, n: number): PlaceMedia => ({
      type: 'photo',
      url: `https://c/${author}-${n}.jpg`,
      thumb: '',
      author,
      link: '',
      source: 'commons',
    });
    // Un contributeur prolifique (6 macros) et deux autres photographes
    const input = [
      ...Array.from({ length: 6 }, (_, i) => of('macro', i)),
      of('paysagiste', 0),
      of('randonneur', 0),
    ];
    const picked = diversifyByAuthor(input, 4);
    expect(picked).toHaveLength(4);
    expect(new Set(picked.map((p) => p.author)).size).toBe(3);
    // Le prolifique ne prend pas toute la place : 2 sur 4 au plus
    expect(picked.filter((p) => p.author === 'macro').length).toBeLessThanOrEqual(2);
  });

  it('écarte les fichiers non photographiques de Commons', async () => {
    const payload = {
      query: {
        pages: {
          '1': {
            title: 'File:Carte du massif.svg',
            imageinfo: [{ thumburl: 'https://commons/carte.svg', extmetadata: {} }],
          },
        },
      },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })),
    );
    expect(await findCommonsMedia(47.9, 7.1, 5)).toEqual([]);
  });

  it('sans résultat Commons : repli sur la recherche par mot-clé', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes('commons.wikimedia.org')
        ? new Response(JSON.stringify({ query: { pages: {} } }), { status: 200 })
        : new Response(JSON.stringify(unsplashPayload), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const media = await findPlacePhotos('Lieu sans photo geo', 10, { lat: 0.5, lng: 0.5 });
    expect(media[0]?.source).toBe('unsplash');
  });

  it('renvoie [] sans clé API configurée', async () => {
    delete process.env['UNSPLASH_ACCESS_KEY'];
    expect(await findPlacePhotos('Nulle part')).toEqual([]);
  });

  it('renvoie [] quand le fournisseur échoue', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    expect(await findPlacePhotos('Colmar en panne')).toEqual([]);
  });
});

describe('GET /api/photos', () => {
  beforeEach(() => {
    clearGalleryCache();
    process.env['UNSPLASH_ACCESS_KEY'] = 'test-key';
  });
  afterEach(() => {
    delete process.env['UNSPLASH_ACCESS_KEY'];
    vi.unstubAllGlobals();
  });

  it('renvoie la galerie du lieu', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(unsplashPayload), { status: 200 })),
    );
    const res = await request(createApp({ provider: mockProvider })).get('/api/photos?q=Colmar');
    expect(res.status).toBe(200);
    expect(res.body.media).toHaveLength(1);
    expect(res.headers['cache-control']).toContain('max-age=3600');
  });

  it('400 sur requête trop courte ou absente', async () => {
    const app = createApp({ provider: mockProvider });
    expect((await request(app).get('/api/photos?q=a')).status).toBe(400);
    expect((await request(app).get('/api/photos')).status).toBe(400);
  });
});

describe('couvertures de trip par coordonnées', () => {
  const commonsPayload = (title: string, url: string) => ({
    query: {
      pages: {
        '1': {
          title,
          imageinfo: [{ thumburl: url, descriptionurl: 'https://commons.wikimedia.org/wiki/x' }],
        },
      },
    },
  });
  const trip = {
    waypoints: [
      { name: 'Colmar', lat: 48.08, lng: 7.36, kind: 'start' },
      { name: 'Col de la Schlucht', lat: 48.063, lng: 7.021, kind: 'stage' },
      { name: 'Munster', lat: 48.04, lng: 7.14, kind: 'end' },
    ],
    days: [
      {
        activities: [
          { type: 'drive', title: 'Route des Crêtes', lat: 48.06, lng: 7.02 },
          { type: 'hike', title: 'Hohneck', lat: 48.03, lng: 7.0 },
        ],
      },
    ],
  };

  beforeEach(() => {
    process.env['UNSPLASH_ACCESS_KEY'] = 'test-key';
    delete process.env['PEXELS_API_KEY'];
  });
  afterEach(() => {
    delete process.env['UNSPLASH_ACCESS_KEY'];
    vi.unstubAllGlobals();
  });

  it('ancre d’abord le temps fort du jour, puis les étapes, jamais deux fois le même lieu', () => {
    const anchors = coverAnchors(trip);
    expect(anchors.map((a) => a.title)).toEqual([
      'Hohneck',
      'Col de la Schlucht',
      'Colmar',
      'Munster',
    ]);
  });

  it('prend une photo prise sur place plutôt que la recherche par mots-clés', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes('commons.wikimedia.org')
        ? new Response(JSON.stringify(commonsPayload('File:Hohneck été.jpg', 'https://commons/hohneck.jpg')), { status: 200 })
        : new Response(JSON.stringify(unsplashPayload), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    expect(await findTripCover(trip, ['vosges'])).toBe('https://commons/hohneck.jpg');
    expect(fetchMock.mock.calls.every(([u]) => String(u).includes('commons'))).toBe(true);
    // Le premier ancrage est le Hohneck (temps fort), pas la ville de départ
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('48.03%7C7');
  });

  it('sans photo sur place : repli sur les mots-clés de région, deux ancrages au plus', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes('commons.wikimedia.org')
        ? new Response(JSON.stringify({ query: { pages: {} } }), { status: 200 })
        : new Response(JSON.stringify(unsplashPayload), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    expect(await findTripCover(trip, ['vosges'])).toBe('https://img/1-regular');
    const commonsCalls = fetchMock.mock.calls.filter(([u]) => String(u).includes('commons'));
    expect(commonsCalls).toHaveLength(2);
  });

  it('photo du jour : le temps fort cherché sur place, mots-clés à défaut', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes('commons.wikimedia.org')
        ? new Response(JSON.stringify(url.includes('48.03') ? commonsPayload('File:Hohneck.jpg', 'https://commons/j2.jpg') : { query: { pages: {} } }), { status: 200 })
        : new Response(JSON.stringify(unsplashPayload), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const days: { title: string; activities: { type: string; title: string; lat: number; lng: number }[]; photo_url?: string }[] = [
      { title: 'J1', activities: [{ type: 'drive', title: 'Route', lat: 48.06, lng: 7.02 }] },
      { title: 'J2', activities: [{ type: 'hike', title: 'Hohneck', lat: 48.03, lng: 7.0 }] },
    ];
    await findDayPhotos(days, ['vosges']);
    expect(days[1]?.photo_url).toBe('https://commons/j2.jpg');
    expect(days[0]?.photo_url).toBe('https://img/1-regular');
  });
});
