import { PLANS, type PlanId } from '@triptic/shared';

interface QuotaEntry {
  month: string;
  used: number;
}

/** Quota de générations IA par mois (in-memory ; Redis en production VPS). */
export class QuotaService {
  private readonly usage = new Map<string, QuotaEntry>();

  private currentMonth(): string {
    return new Date().toISOString().slice(0, 7);
  }

  remaining(userId: string, plan: PlanId): number {
    const limit = PLANS[plan].limits.ai_trips_per_month;
    if (!Number.isFinite(limit)) return Number.POSITIVE_INFINITY;
    const entry = this.usage.get(userId);
    const used = entry?.month === this.currentMonth() ? entry.used : 0;
    return Math.max(0, limit - used);
  }

  consume(userId: string, plan: PlanId): boolean {
    if (this.remaining(userId, plan) <= 0) return false;
    const month = this.currentMonth();
    const entry = this.usage.get(userId);
    if (entry?.month === month) {
      entry.used += 1;
    } else {
      this.usage.set(userId, { month, used: 1 });
    }
    return true;
  }
}
