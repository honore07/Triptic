import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

// .env à la racine du monorepo (jamais versionné)
const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../../.env') });

export const env = {
  nodeEnv: process.env['NODE_ENV'] ?? 'development',
  port: Number(process.env['PORT'] ?? 3001),
  appUrl: process.env['APP_URL'] ?? 'http://localhost:5173',
  databaseUrl: process.env['DATABASE_URL'],
  jwtSecret: process.env['JWT_SECRET'],
  /**
   * Projet Supabase (auth) — ex. https://xxxx.supabase.co. Défini → les JWT
   * sont vérifiés via son JWKS (ES256). Absent → repli HS256 sur JWT_SECRET
   * (tests), sinon utilisateur anonyme.
   */
  supabaseUrl: process.env['SUPABASE_URL'] ?? null,
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
