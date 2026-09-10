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
  private readonly crmWebhookUrl: string | undefined;
  private readonly crmDeleteWebhookUrl: string | undefined;

  constructor(
    databaseUrl: string,
    crmWebhookUrl = process.env['N8N_CRM_WEBHOOK_URL'],
    crmDeleteWebhookUrl = process.env['N8N_CRM_DELETE_WEBHOOK_URL'],
  ) {
    this.sql = postgres(databaseUrl, { max: 2 });
    this.crmWebhookUrl = crmWebhookUrl;
    this.crmDeleteWebhookUrl = crmDeleteWebhookUrl;
  }

  async ensure(user: AuthUser): Promise<void> {
    if (!user.authenticated || !UUID_RE.test(user.id) || this.seen.has(user.id)) return;
    try {
      const inserted = await this.sql<{ id: string }[]>`
        INSERT INTO users (id, email)
        VALUES (${user.id}, ${user.email ?? `${user.id}@no-email.triptic`})
        ON CONFLICT DO NOTHING
        RETURNING id
      `;
      this.seen.add(user.id);
      // Nouvelle inscription (insert réel, pas un conflit) → sync CRM via n8n
      if (inserted.length > 0) this.notifySignup(user);
    } catch (error) {
      // Jamais bloquant pour la requête en cours — la FK échouera au pire
      logger.error({ error, context: 'user-provisioning' }, 'users upsert failed');
    }
  }

  /** Webhook n8n → Brevo (fire-and-forget, jamais bloquant, jamais throw). */
  private notifySignup(user: AuthUser): void {
    if (!this.crmWebhookUrl || !user.email) return;
    void fetch(this.crmWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'signup',
        email: user.email,
        user_id: user.id,
        plan: user.plan,
        signed_up_at: new Date().toISOString(),
      }),
    })
      .then(() => logger.info({ context: 'crm-sync' }, 'Signup pushed to CRM webhook'))
      .catch((error) =>
        logger.error({ error, context: 'crm-sync' }, 'CRM webhook failed'),
      );
  }

  /**
   * Droit à l'effacement : toutes les données VIRE du compte, en une seule
   * transaction. Les retours laissés sur ses trips partent avec eux
   * (trip_feedbacks.trip_id n'a pas de cascade).
   */
  async deleteAccount(userId: string): Promise<void> {
    if (!UUID_RE.test(userId)) return;
    await this.sql.begin(async (tx) => {
      await tx`
        DELETE FROM trip_feedbacks
        WHERE user_id = ${userId}
           OR trip_id IN (SELECT id FROM trips WHERE user_id = ${userId})
      `;
      await tx`DELETE FROM trips WHERE user_id = ${userId}`;
      await tx`DELETE FROM ai_sessions WHERE user_id = ${userId}`;
      await tx`DELETE FROM place_reviews WHERE user_id = ${userId}`;
      await tx`DELETE FROM generation_quotas WHERE user_id = ${userId}`;
      await tx`DELETE FROM users WHERE id = ${userId}`;
    });
    this.seen.delete(userId);
  }

  /**
   * Retire le contact du CRM. Webhook dédié : celui des inscriptions
   * ré-upserterait le contact dans Brevo au lieu de l'effacer.
   */
  notifyDeletion(email: string | undefined): void {
    if (!this.crmDeleteWebhookUrl || !email) return;
    void fetch(this.crmDeleteWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'account_deleted',
        email,
        deleted_at: new Date().toISOString(),
      }),
    })
      .then(() => logger.info({ context: 'crm-sync' }, 'Account deletion pushed to CRM webhook'))
      .catch((error) =>
        logger.error({ error, context: 'crm-sync' }, 'CRM deletion webhook failed'),
      );
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
