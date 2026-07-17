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
  isProd: (process.env['NODE_ENV'] ?? 'development') === 'production',
};
