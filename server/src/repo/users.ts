import postgres from 'postgres';
import type { AuthUser } from '../middleware/auth.js';
import { logger } from '../logger.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Provisioning des comptes : le sub JWT Supabase devient users.id (FK des
 * trips). Upsert au premier accès écrivain, mémoïsé par process — un reload
 * PM2 ré-upserte, l'opération est idempotente (ON CONFLICT DO NOTHING).
 */
export class PgUserRepo {
  private readonly sql: postgres.Sql;
  private readonly seen = new Set<string>();

  constructor(databaseUrl: string) {
    this.sql = postgres(databaseUrl, { max: 2 });
  }

  async ensure(user: AuthUser): Promise<void> {
    if (!user.authenticated || !UUID_RE.test(user.id) || this.seen.has(user.id)) return;
    try {
      await this.sql`
        INSERT INTO users (id, email)
        VALUES (${user.id}, ${user.email ?? `${user.id}@no-email.triptic`})
        ON CONFLICT DO NOTHING
      `;
      this.seen.add(user.id);
    } catch (error) {
      // Jamais bloquant pour la requête en cours — la FK échouera au pire
      logger.error({ error, context: 'user-provisioning' }, 'users upsert failed');
    }
  }

  /** Plan stocké (Stripe plus tard) — null si compte inconnu. */
  async getPlan(userId: string): Promise<string | null> {
    if (!UUID_RE.test(userId)) return null;
    const rows = await this.sql<{ plan: string }[]>`
      SELECT plan FROM users WHERE id = ${userId}
    `;
    return rows[0]?.plan ?? null;
  }
}
