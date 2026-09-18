import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { PHOTO_RULES_VERSION } from '../agents/photoAgent.js';
import { createApp } from '../app.js';
import type { GalleryStore } from '../repo/galleries.js';
import {
  clearGalleryCache,
  coverAnchors,
  diversifyByAuthor,
  findCommonsMedia,
  findDayPhotos,
  findPlacePhotos,
  findTripCover,
  GALLERY_KEY_PREFIX,
  setGalleryStore,
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

/** Page Commons (API format 1) d'une photo 3:2 assez grande. */
const commonsPage = (title: string, url: string, extra: Record<string, unknown> = {}) => ({
  title,
  imageinfo: [
    {
      thumburl: url,
      descriptionurl: 'https://commons.wikimedia.org/wiki/x',
      width: 4000,
      height: 2667,
      ...extra,
    },
  ],
});
const commonsPayload = (...pages: ReturnType<typeof commonsPage>[]) => ({
  query: { pages: Object.fromEntries(pages.map((page, i) => [String(i + 1), page])) },
});
const EMPTY_COMMONS = { query: { pages: {} } };
/** Latitude interrogée, que la requête Commons soit une recherche ou une géo-recherche. */
const latOf = (url: string) => /(?:ggscoord=|nearcoord%3A5km%2C)([\d.]+)/.exec(url)?.[1] ?? '';

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
    const payload = commonsPayload(
      commonsPage('File:Col Petit Ballon 2024.jpg', 'https://commons/petit-ballon-900.jpg', {
        descriptionurl: 'https://commons.wikimedia.org/wiki/File:Col.jpg',
        extmetadata: {
          Artist: { value: '<a href="/wiki/User:X">Jesper B.</a>' },
          LicenseShortName: { value: 'CC BY-SA 4.0' },
        },
      }),
    );
    const fetchMock = vi.fn(async (url: string) =>
      url.includes('commons.wikimedia.org')
        ? new Response(JSON.stringify(payload), { status: 200 })
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
    // Les faits Commons servent au tri, jamais au client
    expect(media[0]).not.toHaveProperty('facts');
    // Aucun appel Unsplash/Pexels : c'est eux qui renvoyaient des baudruches
    expect(fetchMock.mock.calls.every(([u]) => String(u).includes('commons'))).toBe(true);
  });

  it('une voiture de police prise sur place ne passe pas, même sans agent', async () => {
    const police = commonsPayload(
      commonsPage('File:DSC01021 Jeep Cherokee, Carabinieri, Front Right.jpg', 'https://commons/jeep.jpg', {
        extmetadata: {
          Categories: { value: 'Jeep Grand Cherokee of the Carabinieri|2023 Republic Day in Bolzano (Italy)' },
        },
      }),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.includes('commons.wikimedia.org')
          ? new Response(JSON.stringify(police), { status: 200 })
          : new Response(JSON.stringify(unsplashPayload), { status: 200 }),
      ),
    );
    const media = await findPlacePhotos('Centre de Bolzano', 10, { lat: 46.4983, lng: 11.3548 });
    expect(media.map((m) => m.url)).not.toContain('https://commons/jeep.jpg');
  });

  it('range les galeries sous la version des règles photo', async () => {
    const written: string[] = [];
    const store: GalleryStore = {
      get: async () => null,
      set: async (key) => {
        written.push(key);
      },
      staleTargets: async () => [],
    };
    setGalleryStore(store);
    try {
      vi.stubGlobal(
        'fetch',
        vi.fn(
          async () =>
            new Response(JSON.stringify(commonsPayload(commonsPage('File:Vue du Hohneck.jpg', 'https://commons/h.jpg'))), {
              status: 200,
            }),
        ),
      );
      await findPlacePhotos('Hohneck', 10, { lat: 48.03, lng: 7.0 });
      expect(GALLERY_KEY_PREFIX).toContain(PHOTO_RULES_VERSION);
      expect(written).toHaveLength(1);
      expect(written[0]?.startsWith(GALLERY_KEY_PREFIX)).toBe(true);
    } finally {
      setGalleryStore(null);
    }
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

  it('cherche d’abord les vues d’ensemble autour du point, puis les photos les plus proches', async () => {
    const fetchMock = vi.fn(
      async (_url: string) => new Response(JSON.stringify(EMPTY_COMMONS), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await findCommonsMedia(48.03, 7.0, 8);
    const [search, nearest] = fetchMock.mock.calls.map(([u]) => decodeURIComponent(String(u)));
    expect(search).toContain('generator=search');
    expect(search).toContain('nearcoord:5km,48.03,7');
    expect(search).toContain('panorama OR landscape');
    expect(nearest).toContain('generator=geosearch');
  });

  it('une requête Commons pendue est abandonnée et rend son créneau', async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal(
        'fetch',
        vi.fn(
          (_url: string, init?: RequestInit) =>
            new Promise<Response>((_resolve, reject) => {
              init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
            }),
        ),
      );
      // Trois points pendus à la fois : les trois créneaux Commons sont pris
      const hung = Promise.all([1, 2, 3].map((n) => findCommonsMedia(n, n, 8)));
      await vi.advanceTimersByTimeAsync(8000); // recherches abandonnées
      await vi.advanceTimersByTimeAsync(8000); // géo-recherches abandonnées
      expect(await hung).toEqual([[], [], []]);
    } finally {
      vi.useRealTimers();
    }
    // Créneaux rendus : la requête suivante passe au lieu d'attendre sans fin
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify(commonsPayload(commonsPage('File:Vue du Hohneck.jpg', 'https://commons/h.jpg'))), {
            status: 200,
          }),
      ),
    );
    expect(await findCommonsMedia(48.03, 7.0, 1)).toHaveLength(1);
  });

  it('sans résultat Commons : repli sur la recherche par mot-clé', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes('commons.wikimedia.org')
        ? new Response(JSON.stringify(EMPTY_COMMONS), { status: 200 })
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
    clearGalleryCache();
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

  it('la couverture préfère une rando à la visite d’un centre-ville', () => {
    const dolomites = {
      waypoints: [{ name: 'Bolzano', lat: 46.4983, lng: 11.3548, kind: 'start' }],
      days: [
        {
          activities: [
            { type: 'visit', title: 'Centre de Bolzano', lat: 46.4983, lng: 11.3548 },
            { type: 'hike', title: 'Balade à Seceda', lat: 46.604, lng: 11.732 },
          ],
        },
      ],
    };
    expect(coverAnchors(dolomites).map((a) => a.title)).toEqual(['Balade à Seceda', 'Centre de Bolzano']);
  });

  it('prend une vue prise sur place plutôt que la recherche par mots-clés', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      !url.includes('commons.wikimedia.org')
        ? new Response(JSON.stringify(unsplashPayload), { status: 200 })
        : latOf(url) === '48.03'
          ? new Response(
              JSON.stringify(commonsPayload(commonsPage('File:Vue du Hohneck en été.jpg', 'https://commons/hohneck.jpg'))),
              { status: 200 },
            )
          : new Response(JSON.stringify(EMPTY_COMMONS), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    expect(await findTripCover(trip, ['vosges'])).toBe('https://commons/hohneck.jpg');
    expect(fetchMock.mock.calls.every(([u]) => String(u).includes('commons'))).toBe(true);
    // Le premier point cherché est le Hohneck (temps fort), pas la ville de départ
    expect(latOf(String(fetchMock.mock.calls[0]?.[0]))).toBe('48.03');
  });

  it('une voiture de police sur le temps fort ne fait pas la couverture : point suivant', async () => {
    const jeep = commonsPage('File:DSC01021 Jeep Cherokee, Carabinieri, Front Right.jpg', 'https://commons/jeep.jpg', {
      extmetadata: { Categories: { value: 'Jeep Grand Cherokee of the Carabinieri' } },
    });
    const view = commonsPage('File:Vue depuis le col de la Schlucht.jpg', 'https://commons/schlucht.jpg');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const lat = latOf(url);
        const body = lat === '48.03' ? commonsPayload(jeep) : lat === '48.063' ? commonsPayload(view) : EMPTY_COMMONS;
        return new Response(JSON.stringify(body), { status: 200 });
      }),
    );
    expect(await findTripCover(trip, ['vosges'])).toBe('https://commons/schlucht.jpg');
  });

  it('sans photo sur place : repli sur les mots-clés de région, deux points au plus', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes('commons.wikimedia.org')
        ? new Response(JSON.stringify(EMPTY_COMMONS), { status: 200 })
        : new Response(JSON.stringify(unsplashPayload), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    expect(await findTripCover(trip, ['vosges'])).toBe('https://img/1-regular');
    const searched = new Set(
      fetchMock.mock.calls.map(([u]) => String(u)).filter((u) => u.includes('commons')).map(latOf),
    );
    expect([...searched]).toEqual(['48.03', '48.063']);
  });

  it('photo du jour : le temps fort cherché sur place, mots-clés à défaut', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      !url.includes('commons.wikimedia.org')
        ? new Response(JSON.stringify(unsplashPayload), { status: 200 })
        : latOf(url) === '48.03'
          ? new Response(
              JSON.stringify(commonsPayload(commonsPage('File:Panorama du Hohneck.jpg', 'https://commons/j2.jpg'))),
              { status: 200 },
            )
          : new Response(JSON.stringify(EMPTY_COMMONS), { status: 200 }),
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

  it('photo du jour : la rando passe avant le centre-ville du même jour', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const lat = latOf(url);
        const body =
          lat === '46.604'
            ? commonsPayload(commonsPage('File:Seceda panorama.jpg', 'https://commons/seceda.jpg'))
            : lat === '46.4983'
              ? commonsPayload(commonsPage('File:Vue de Bolzano.jpg', 'https://commons/bolzano.jpg'))
              : EMPTY_COMMONS;
        return new Response(JSON.stringify(body), { status: 200 });
      }),
    );
    const days = [
      {
        title: 'Alpe di Siusi et panorama du Seceda',
        activities: [
          { type: 'visit', title: 'Centre de Bolzano', lat: 46.4983, lng: 11.3548 },
          { type: 'hike', title: 'Balade à Seceda', lat: 46.604, lng: 11.732 },
        ],
      } as { title: string; activities: { type: string; title: string; lat: number; lng: number }[]; photo_url?: string },
    ];
    await findDayPhotos(days, ['dolomites']);
    expect(days[0]?.photo_url).toBe('https://commons/seceda.jpg');
  });
});

describe('vignettes Wikimedia (thumb.wikimedia.org)', () => {
  beforeEach(() => {
    clearGalleryCache();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('retire les paramètres de suivi de l’URL de vignette', async () => {
    const { withoutTracking } = await import('../services/photos.js');
    expect(
      withoutTracking(
        'https://thumb.wikimedia.org/wikipedia/commons/thumb/9/96/A.jpg/960px-A.jpg?utm_source=commons.wikimedia.org&utm_content=thumbnail',
      ),
    ).toBe('https://thumb.wikimedia.org/wikipedia/commons/thumb/9/96/A.jpg/960px-A.jpg');
    expect(withoutTracking('pas une url')).toBe('pas une url');
  });

  it('la galerie Commons expose des URL propres', async () => {
    const payload = {
      query: {
        pages: {
          '1': {
            title: 'File:Annecy.jpg',
            imageinfo: [
              {
                thumburl:
                  'https://thumb.wikimedia.org/wikipedia/commons/thumb/9/96/Annecy.jpg/960px-Annecy.jpg?utm_source=commons.wikimedia.org',
                descriptionurl: 'https://commons.wikimedia.org/wiki/File:Annecy.jpg',
              },
            ],
          },
        },
      },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })),
    );
    const [first] = await findCommonsMedia(45.9, 6.13, 5);
    expect(first?.url).toBe(
      'https://thumb.wikimedia.org/wikipedia/commons/thumb/9/96/Annecy.jpg/960px-Annecy.jpg',
    );
    expect(first?.thumb).toBe(first?.url);
  });

  it('photos du jour : plusieurs jours à la fois, jamais plus de trois appels Commons simultanés', async () => {
    let inFlight = 0;
    let peak = 0;
    const fetchMock = vi.fn(async (url: string) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      const lat = latOf(url);
      return new Response(
        JSON.stringify(commonsPayload(commonsPage(`File:Vue du sommet ${lat}.jpg`, `https://commons/${lat}.jpg`))),
        { status: 200 },
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    const days: {
      title: string;
      activities: { type: string; title: string; lat: number; lng: number }[];
      photo_url?: string;
    }[] = Array.from({ length: 7 }, (_, i) => ({
      title: `J${i + 1}`,
      activities: [{ type: 'hike', title: `Sommet ${i + 1}`, lat: 45 + i, lng: 6 }],
    }));
    await findDayPhotos(days, ['alpes']);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(3);
    // Chaque jour garde SA photo, quel que soit l'ordre d'arrivée des réponses
    days.forEach((day, i) => expect(day.photo_url).toBe(`https://commons/${45 + i}.jpg`));
  });
});
