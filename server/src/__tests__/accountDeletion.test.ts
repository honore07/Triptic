import { describe, expect, it, vi } from 'vitest';

// Avant tout import : JWT HS256 de test, et aucun projet Supabase (un .env
// local ne doit pas faire basculer l'auth sur le JWKS du vrai projet).
const SECRET = vi.hoisted(() => {
  process.env['JWT_SECRET'] = 'secret-de-test-suppression';
  process.env['SUPABASE_URL'] = '';
  return 'secret-de-test-suppression';
});

import jwt from 'jsonwebtoken';
import request from 'supertest';
import type { LlmProvider } from '@triptic/ai-engine';
import { createApp } from '../app.js';
import { MemoryTripRepo } from '../repo/trips.js';
import type { PgUserRepo } from '../repo/users.js';

const USER_ID = '7d3f1a52-6b0e-4c1a-9f3d-2e8b5c4a1f00';
const OTHER_ID = '1b2c3d4e-5f60-4718-8a9b-0c1d2e3f4a5b';

const provider: LlmProvider = {
  name: 'mock',
  complete: async () => '{}',
  correct: async () => '{"valid": true, "issues": []}',
};

function bearer(sub = USER_ID): string {
  return `Bearer ${jwt.sign({ sub, email: 'marcheur@vire.test' }, SECRET)}`;
}

function authAdmin(deleted = true) {
  return { deleteUser: vi.fn(async (_userId: string) => deleted) };
}

function fakeUsers(deleteAccount: (userId: string) => Promise<void> = async () => undefined) {
  return {
    ensure: vi.fn(async () => undefined),
    deleteAccount: vi.fn(deleteAccount),
    notifyDeletion: vi.fn(),
  };
}

async function saveTrip(repo: MemoryTripRepo, userId: string): Promise<void> {
  await repo.save({ user_id: userId, title: 'Crêtes' } as Parameters<MemoryTripRepo['save']>[0]);
}

describe('DELETE /api/me — droit à l’effacement', () => {
  it('refuse un visiteur sans compte', async () => {
    const res = await request(createApp({ provider, authAdmin: authAdmin() })).delete('/api/me');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('auth_required');
  });

  it('503 explicite tant que la clé secrète Supabase manque — rien n’est effacé', async () => {
    const repo = new MemoryTripRepo();
    await saveTrip(repo, USER_ID);
    const res = await request(createApp({ provider, repo }))
      .delete('/api/me')
      .set('Authorization', bearer());
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('account_deletion_unavailable');
    expect(await repo.listByUser(USER_ID)).toHaveLength(1);
  });

  it('efface les trips du compte, puis le compte, sans toucher aux autres', async () => {
    const repo = new MemoryTripRepo();
    await saveTrip(repo, USER_ID);
    await saveTrip(repo, OTHER_ID);
    const admin = authAdmin();
    const res = await request(createApp({ provider, repo, authAdmin: admin }))
      .delete('/api/me')
      .set('Authorization', bearer());
    expect(res.status).toBe(204);
    expect(await repo.listByUser(USER_ID)).toHaveLength(0);
    expect(await repo.listByUser(OTHER_ID)).toHaveLength(1);
    expect(admin.deleteUser).toHaveBeenCalledWith(USER_ID);
  });

  it('avec la base : efface les données, ferme le compte, prévient le CRM', async () => {
    const users = fakeUsers();
    const admin = authAdmin();
    const res = await request(
      createApp({ provider, users: users as unknown as PgUserRepo, authAdmin: admin }),
    )
      .delete('/api/me')
      .set('Authorization', bearer());
    expect(res.status).toBe(204);
    expect(users.deleteAccount).toHaveBeenCalledWith(USER_ID);
    expect(admin.deleteUser).toHaveBeenCalledWith(USER_ID);
    expect(users.notifyDeletion).toHaveBeenCalledWith('marcheur@vire.test');
  });

  it('données impossibles à effacer : 500, et le compte reste ouvert', async () => {
    const users = fakeUsers(async () => {
      throw new Error('connexion perdue');
    });
    const admin = authAdmin();
    const res = await request(
      createApp({ provider, users: users as unknown as PgUserRepo, authAdmin: admin }),
    )
      .delete('/api/me')
      .set('Authorization', bearer());
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('account_deletion_failed');
    expect(admin.deleteUser).not.toHaveBeenCalled();
    expect(users.notifyDeletion).not.toHaveBeenCalled();
  });

  it('compte impossible à fermer : 502 distinct, CRM pas prévenu tant que ce n’est pas fini', async () => {
    const users = fakeUsers();
    const res = await request(
      createApp({ provider, users: users as unknown as PgUserRepo, authAdmin: authAdmin(false) }),
    )
      .delete('/api/me')
      .set('Authorization', bearer());
    expect(res.status).toBe(502);
    expect(res.body.error).toBe('auth_deletion_failed');
    expect(users.deleteAccount).toHaveBeenCalledWith(USER_ID);
    expect(users.notifyDeletion).not.toHaveBeenCalled();
  });
});
