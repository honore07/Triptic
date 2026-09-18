import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ImageJudge } from '@triptic/ai-engine';
import { checkByEye, setPhotoJudge, VISION_PROMPT } from '../agents/photoVision.js';

const FEET = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Viewpoint.jpg/960px-Viewpoint.jpg';
const VIEW = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/c/cd/Hohneck.jpg/960px-Hohneck.jpg';

/** Les téléchargements d'images renvoient un JPEG minuscule. */
function stubImages() {
  const fetchMock = vi.fn(
    async (_url: string) =>
      new Response(new Uint8Array([0xff, 0xd8, 0xff]), { status: 200, headers: { 'content-type': 'image/jpeg' } }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function judge(reply: () => Promise<string>) {
  const look = vi.fn(async (_opts: Parameters<ImageJudge['look']>[0]) => reply());
  return { name: 'mock-eye', look } satisfies ImageJudge;
}

describe('checkByEye — le second regard', () => {
  afterEach(() => {
    setPhotoJudge(null);
    vi.unstubAllGlobals();
  });

  it('sans juge : aucun verdict, l’agent texte fait foi', async () => {
    const fetchMock = stubImages();
    setPhotoJudge(null);
    expect((await checkByEye([FEET])).size).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('écarte ce que l’image montre, quoi que dise le titre', async () => {
    const fetchMock = stubImages();
    const eye = judge(async () => '{"keep": [1]}');
    setPhotoJudge(eye);
    const seen = await checkByEye([FEET, VIEW]);
    expect(seen.get(FEET)).toBe(false);
    expect(seen.get(VIEW)).toBe(true);
    // Images envoyées en petit format (330 px), avec le prompt versionné
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/330px-Viewpoint.jpg');
    expect(eye.look.mock.calls[0]?.[0].system).toBe(VISION_PROMPT);
    expect(eye.look.mock.calls[0]?.[0].images).toHaveLength(2);
  });

  it('une photo ne se regarde qu’une fois', async () => {
    stubImages();
    const eye = judge(async () => '{"keep": [0]}');
    setPhotoJudge(eye);
    await checkByEye([VIEW]);
    await checkByEye([`${VIEW}?utm_source=commons`]);
    expect(eye.look).toHaveBeenCalledTimes(1);
  });

  it('juge en panne : pas de verdict, puis mis de côté au lieu de faire attendre chaque lot', async () => {
    stubImages();
    const eye = judge(async () => {
      throw new Error('overloaded');
    });
    setPhotoJudge(eye);
    expect((await checkByEye([FEET])).size).toBe(0);
    expect((await checkByEye([VIEW])).size).toBe(0);
    expect(eye.look).toHaveBeenCalledTimes(1);
  });

  it('image injoignable : pas montrée, pas de verdict', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })));
    const eye = judge(async () => '{"keep": []}');
    setPhotoJudge(eye);
    expect((await checkByEye([FEET])).size).toBe(0);
    expect(eye.look).not.toHaveBeenCalled();
  });
});
