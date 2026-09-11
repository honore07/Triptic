import { afterEach, describe, expect, it, vi } from 'vitest';
import { preloadImages } from '../lib/preloadImages';

const requested: string[] = [];

class FakeImage {
  decoding = '';
  set src(value: string) {
    requested.push(value);
  }
}

function setSaveData(saveData: boolean | undefined) {
  Object.defineProperty(navigator, 'connection', {
    value: saveData === undefined ? undefined : { saveData },
    configurable: true,
  });
}

describe('preloadImages', () => {
  afterEach(() => {
    requested.length = 0;
    setSaveData(undefined);
    vi.unstubAllGlobals();
  });

  it('précharge chaque image une seule fois et ignore les trous', () => {
    vi.stubGlobal('Image', FakeImage);
    preloadImages(['https://a/1.jpg', null, 'https://a/1.jpg', undefined, 'https://a/2.jpg']);
    expect(requested).toEqual(['https://a/1.jpg', 'https://a/2.jpg']);
  });

  it('ne télécharge rien en mode économie de données', () => {
    vi.stubGlobal('Image', FakeImage);
    setSaveData(true);
    preloadImages(['https://a/1.jpg']);
    expect(requested).toEqual([]);
  });
});
