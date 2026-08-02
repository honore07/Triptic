import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { clearGalleryCache, findPlacePhotos } from '../services/photos.js';

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
    const photos = await findPlacePhotos('Colmar');
    expect(photos).toHaveLength(1);
    expect(photos[0]).toMatchObject({
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
    expect(res.body.photos).toHaveLength(1);
    expect(res.headers['cache-control']).toContain('max-age=3600');
  });

  it('400 sur requête trop courte ou absente', async () => {
    const app = createApp({ provider: mockProvider });
    expect((await request(app).get('/api/photos?q=a')).status).toBe(400);
    expect((await request(app).get('/api/photos')).status).toBe(400);
  });
});
