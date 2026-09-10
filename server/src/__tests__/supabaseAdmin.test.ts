import { describe, expect, it, vi } from 'vitest';
import { SupabaseAuthAdmin } from '../services/supabaseAdmin.js';

const USER_ID = '5f0c2d7e-8a51-4d0e-9a51-2c7f3b1e9a10';

function fakeFetch(status: number) {
  return vi.fn(
    async (_url: string | URL | Request, _init?: RequestInit) => new Response(null, { status }),
  );
}

describe('SupabaseAuthAdmin.deleteUser', () => {
  it('clé secrète sb_secret_ : en-tête apikey seul, jamais en Bearer', async () => {
    const fetchImpl = fakeFetch(200);
    const admin = new SupabaseAuthAdmin(
      'https://projet.supabase.co/',
      'sb_secret_abc',
      fetchImpl as unknown as typeof fetch,
    );
    expect(await admin.deleteUser(USER_ID)).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(`https://projet.supabase.co/auth/v1/admin/users/${USER_ID}`);
    expect(init?.method).toBe('DELETE');
    expect(init?.headers).toEqual({ apikey: 'sb_secret_abc' });
  });

  it('ancienne clé service_role (JWT) : apikey et Bearer', async () => {
    const fetchImpl = fakeFetch(200);
    const admin = new SupabaseAuthAdmin(
      'https://projet.supabase.co',
      'eyJ.ancienne.cle',
      fetchImpl as unknown as typeof fetch,
    );
    await admin.deleteUser(USER_ID);
    expect(fetchImpl.mock.calls[0]![1]?.headers).toEqual({
      apikey: 'eyJ.ancienne.cle',
      Authorization: 'Bearer eyJ.ancienne.cle',
    });
  });

  it('un compte déjà absent (404) compte comme supprimé — la relance reste sûre', async () => {
    const admin = new SupabaseAuthAdmin(
      'https://projet.supabase.co',
      'sb_secret_abc',
      fakeFetch(404) as unknown as typeof fetch,
    );
    expect(await admin.deleteUser(USER_ID)).toBe(true);
  });

  it('échec Supabase ou panne réseau → false', async () => {
    const failing = new SupabaseAuthAdmin(
      'https://projet.supabase.co',
      'sb_secret_abc',
      fakeFetch(500) as unknown as typeof fetch,
    );
    expect(await failing.deleteUser(USER_ID)).toBe(false);

    const offline = new SupabaseAuthAdmin('https://projet.supabase.co', 'sb_secret_abc', (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch);
    expect(await offline.deleteUser(USER_ID)).toBe(false);
  });
});
