import { logger } from '../logger.js';

/** Suppression des comptes d'authentification (droit à l'effacement). */
export interface AuthAdmin {
  /** true si le compte n'existe plus — un compte déjà absent compte comme supprimé. */
  deleteUser(userId: string): Promise<boolean>;
}

/**
 * API admin Supabase Auth. Une clé secrète `sb_secret_…` n'est pas un JWT : elle
 * voyage dans `apikey` uniquement — en Bearer, Supabase la refuse. Une ancienne
 * clé service_role, qui est un JWT, part dans les deux en-têtes.
 */
export class SupabaseAuthAdmin implements AuthAdmin {
  private readonly supabaseUrl: string;
  private readonly secretKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(supabaseUrl: string, secretKey: string, fetchImpl: typeof fetch = fetch) {
    this.supabaseUrl = supabaseUrl.replace(/\/+$/, '');
    this.secretKey = secretKey;
    this.fetchImpl = fetchImpl;
  }

  async deleteUser(userId: string): Promise<boolean> {
    const headers: Record<string, string> = { apikey: this.secretKey };
    if (!this.secretKey.startsWith('sb_secret_')) {
      headers['Authorization'] = `Bearer ${this.secretKey}`;
    }
    const doFetch = this.fetchImpl;
    try {
      const res = await doFetch(
        `${this.supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`,
        { method: 'DELETE', headers },
      );
      if (res.ok || res.status === 404) return true;
      logger.error(
        { status: res.status, context: 'auth-admin-delete' },
        'Supabase account deletion failed',
      );
      return false;
    } catch (error) {
      logger.error({ error, context: 'auth-admin-delete' }, 'Supabase account deletion failed');
      return false;
    }
  }
}
