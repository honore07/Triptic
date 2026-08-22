import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Le wrapper analytics doit être INERTE par défaut (pas de clé en test) et
 * ne jamais jeter — c'est le contrat qui autorise les appels track() partout
 * dans l'app sans garde. Conformité : DNT et opt-out localStorage respectés.
 */

const capture = vi.fn();
const init = vi.fn();
vi.mock('posthog-js', () => ({
  default: { init: (...a: unknown[]) => init(...a), capture: (...a: unknown[]) => capture(...a) },
}));

describe('analytics (PostHog sans cookie)', () => {
  beforeEach(() => {
    vi.resetModules();
    capture.mockClear();
    init.mockClear();
    localStorage.removeItem('triptic-analytics');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('sans clé : init et track sont des no-ops silencieux', async () => {
    const a = await import('../lib/analytics');
    a._resetForTests();
    expect(a.analyticsEnabled()).toBe(false);
    a.initAnalytics();
    expect(init).not.toHaveBeenCalled();
    expect(() => a.track('paywall_opened')).not.toThrow();
    expect(() => a.trackPageview('/plan')).not.toThrow();
    expect(capture).not.toHaveBeenCalled();
  });

  it('clé placeholder phc_xxx : traité comme absent', async () => {
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_xxx');
    const a = await import('../lib/analytics');
    a._resetForTests();
    expect(a.analyticsEnabled()).toBe(false);
  });

  it('avec clé : init configure le mode anonyme sans cookie', async () => {
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test123');
    const a = await import('../lib/analytics');
    a._resetForTests();
    expect(a.analyticsEnabled()).toBe(true);
    a.initAnalytics();
    expect(init).toHaveBeenCalledTimes(1);
    const opts = init.mock.calls[0]![1] as Record<string, unknown>;
    expect(opts.persistence).toBe('memory');
    expect(opts.autocapture).toBe(false);
    expect(opts.disable_session_recording).toBe(true);
    expect(opts.capture_pageview).toBe(false);
    // hôte UE par défaut (RGPD)
    expect(opts.api_host).toBe('https://eu.i.posthog.com');

    a.track('mode_selected', { mode: 'roadtrip' });
    expect(capture).toHaveBeenCalledWith('mode_selected', { mode: 'roadtrip' });
    a.trackPageview('/plan');
    expect(capture).toHaveBeenCalledWith('$pageview', { $current_url: '/plan' });
  });

  it("l'opt-out localStorage désactive tout, même avec une clé", async () => {
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test123');
    localStorage.setItem('triptic-analytics', 'off');
    const a = await import('../lib/analytics');
    a._resetForTests();
    expect(a.analyticsEnabled()).toBe(false);
    a.initAnalytics();
    expect(init).not.toHaveBeenCalled();
  });

  it('init une seule fois même si appelé deux fois', async () => {
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test123');
    const a = await import('../lib/analytics');
    a._resetForTests();
    a.initAnalytics();
    a.initAnalytics();
    expect(init).toHaveBeenCalledTimes(1);
  });
});
