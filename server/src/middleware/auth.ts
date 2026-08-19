import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { PLANS, type PlanId } from '@triptic/shared';
import { env } from '../env.js';

export interface AuthUser {
  id: string;
  plan: PlanId;
  email?: string | undefined;
  /** true = JWT Supabase/HS256 vérifié (jamais pour l'anonyme x-plan). */
  authenticated: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user: AuthUser;
    }
  }
}

/**
 * Auth Supabase. Les JWT du projet sont signés ES256 : vérification via le
 * JWKS public du projet (aucun secret côté serveur). Repli HS256 (JWT_SECRET)
 * conservé pour les tests. En développement sans Supabase : utilisateur
 * anonyme plan free, avec override du plan via le header x-plan (jamais en
 * production, sauf mode démo explicite ALLOW_PLAN_OVERRIDE=true).
 */
export const allowPlanOverride =
  !env.isProd || process.env['ALLOW_PLAN_OVERRIDE'] === 'true';

const jwks = env.supabaseUrl
  ? createRemoteJWKSet(new URL(`${env.supabaseUrl}/auth/v1/.well-known/jwks.json`))
  : null;

function anonymous(req: Request): AuthUser {
  const planHeader = req.headers['x-plan'];
  const devPlan =
    allowPlanOverride && typeof planHeader === 'string' && planHeader in PLANS
      ? (planHeader as PlanId)
      : undefined;
  return { id: 'anonymous', plan: devPlan ?? 'free', authenticated: false };
}

export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;

  if (token && jwks && env.supabaseUrl) {
    void jwtVerify(token, jwks, { issuer: `${env.supabaseUrl}/auth/v1` })
      .then(({ payload }) => {
        req.user = {
          id: payload.sub ?? 'anonymous',
          // Offre de lancement : tout ouvert pour les comptes (avant Stripe)
          plan: env.launchOffer ? 'explorateur' : 'free',
          email: typeof payload['email'] === 'string' ? payload['email'] : undefined,
          authenticated: Boolean(payload.sub),
        };
        next();
      })
      .catch(() => {
        // Token invalide/expiré → anonyme (les routes protégées re-vérifient)
        req.user = anonymous(req);
        next();
      });
    return;
  }

  if (token && env.jwtSecret) {
    try {
      const payload = jwt.verify(token, env.jwtSecret) as jwt.JwtPayload;
      req.user = {
        id: payload.sub ?? 'anonymous',
        plan: (payload['plan'] as PlanId | undefined) ?? 'free',
        email: typeof payload['email'] === 'string' ? payload['email'] : undefined,
        authenticated: Boolean(payload.sub),
      };
      next();
      return;
    } catch {
      // Token invalide → anonyme
    }
  }

  req.user = anonymous(req);
  next();
}
