import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

// .env à la racine du monorepo (jamais versionné)
const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../../.env') });

export const env = {
  nodeEnv: process.env['NODE_ENV'] ?? 'development',
  port: Number(process.env['PORT'] ?? 3001),
  /**
   * Interface d'écoute. Par défaut la boucle locale : en prod c'est
   * Traefik qui expose l'app en HTTPS (il tape sur 127.0.0.1:3001), donc
   * le port ne doit pas être joignable en clair depuis Internet.
   * Mettre HOST=0.0.0.0 pour exposer directement (conteneur, debug).
   */
  host: process.env['HOST'] ?? '127.0.0.1',
  appUrl: process.env['APP_URL'] ?? 'http://localhost:5173',
  databaseUrl: process.env['DATABASE_URL'],
  jwtSecret: process.env['JWT_SECRET'],
  /**
   * Projet Supabase (auth) — ex. https://xxxx.supabase.co. Défini → les JWT
   * sont vérifiés via son JWKS (ES256). Absent → repli HS256 sur JWT_SECRET
   * (tests), sinon utilisateur anonyme.
   */
  supabaseUrl: process.env['SUPABASE_URL'] ?? null,
  /**
   * Supabase configuré → les écritures et la génération exigent un compte.
   * Jamais en environnement de test : les suites exercent le mode anonyme.
   */
  authRequired:
    Boolean(process.env['SUPABASE_URL']) && process.env['NODE_ENV'] !== 'test',
  /**
   * Offre de lancement (avant Stripe) : tout compte connecté reçoit le plan
   * explorateur. À retirer quand Stripe est branché.
   */
  launchOffer: process.env['LAUNCH_OFFER'] === 'true',
  /** GraphHopper self-hosted (VPS) — null = routing désactivé, fallback LLM. */
  graphhopperUrl: process.env['GRAPHHOPPER_URL'] ?? null,
  /**
   * Profil de rando utilisé pour les treks. Défaut `foot` (toujours présent
   * dans le graphe). Passer à `foot_scenic` UNIQUEMENT après reconstruction du
   * graphe VPS avec ce profil (deploy/RUNBOOK-foot-scenic.md) — sinon 400 et
   * repli estimation.
   */
  graphhopperFootProfile: process.env['GRAPHHOPPER_FOOT_PROFILE'] ?? 'foot',
  isProd: (process.env['NODE_ENV'] ?? 'development') === 'production',
};
