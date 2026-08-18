import postgres from 'postgres';
import { PLANS, type PlanId } from '@triptic/shared';

/**
 * Quota de générations IA par mois. Interface async : l'implémentation
 * mémoire sert le dev/tests, PgQuotaService la production (persistant,
 * par utilisateur, survit aux reloads PM2).
 */
export interface Quota {
  remaining(userId: string, plan: PlanId): Promise<number>;
  consume(userId: string, plan: PlanId): Promise<boolean>;
}

function monthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

interface QuotaEntry {
  month: string;
  used: number;
}

/** Quota in-memory — dev et tests uniquement (perdu au restart). */
export class QuotaService implements Quota {
  private readonly usage = new Map<string, QuotaEntry>();

  async remaining(userId: string, plan: PlanId): Promise<number> {
    const limit = PLANS[plan].limits.ai_trips_per_month;
    if (!Number.isFinite(limit)) return Number.POSITIVE_INFINITY;
    const entry = this.usage.get(userId);
    const used = entry?.month === monthKey() ? entry.used : 0;
    return Math.max(0, limit - used);
  }

  async consume(userId: string, plan: PlanId): Promise<boolean> {
    if ((await this.remaining(userId, plan)) <= 0) return false;
    const month = monthKey();
    const entry = this.usage.get(userId);
    if (entry?.month === month) {
      entry.used += 1;
    } else {
      this.usage.set(userId, { month, used: 1 });
    }
    return true;
  }
}

/** Quota persisté en BDD — consume atomique (INSERT … ON CONFLICT). */
export class PgQuotaService implements Quota {
  private readonly sql: postgres.Sql;

  constructor(databaseUrl: string) {
    this.sql = postgres(databaseUrl, { max: 2 });
  }

  async remaining(userId: string, plan: PlanId): Promise<number> {
    const limit = PLANS[plan].limits.ai_trips_per_month;
    if (!Number.isFinite(limit)) return Number.POSITIVE_INFINITY;
    const rows = await this.sql<{ used: number }[]>`
      SELECT used FROM generation_quotas
      WHERE user_id = ${userId} AND month = ${monthKey()}
    `;
    const used = rows[0]?.used ?? 0;
    return Math.max(0, limit - used);
  }

  async consume(userId: string, plan: PlanId): Promise<boolean> {
    const limit = PLANS[plan].limits.ai_trips_per_month;
    if (!Number.isFinite(limit)) return true;
    const rows = await this.sql<{ used: number }[]>`
      INSERT INTO generation_quotas (user_id, month, used)
      VALUES (${userId}, ${monthKey()}, 1)
      ON CONFLICT (user_id, month)
      DO UPDATE SET used = generation_quotas.used + 1
      WHERE generation_quotas.used < ${limit}
      RETURNING used
    `;
    return rows.length > 0;
  }
}
