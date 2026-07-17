import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { PLANS, type PlanId } from '@triptic/shared';
import { env } from '../env.js';

export interface AuthUser {
  id: string;
  plan: PlanId;
}

declare global {
  namespace Express {
    interface Request {
      user: AuthUser;
    }
  }
}

/**
 * Auth Supabase (JWT HS256 signé avec JWT_SECRET).
 * En développement sans JWT_SECRET : utilisateur anonyme plan free,
 * avec override du plan via le header x-plan (jamais en production,
 * sauf mode démo explicite ALLOW_PLAN_OVERRIDE=true — à retirer quand
 * Stripe/Supabase seront branchés).
 */
const allowPlanOverride =
  !env.isProd || process.env['ALLOW_PLAN_OVERRIDE'] === 'true';
export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ') && env.jwtSecret) {
    try {
      const payload = jwt.verify(header.slice(7), env.jwtSecret) as jwt.JwtPayload;
      req.user = {
        id: payload.sub ?? 'anonymous',
        plan: (payload['plan'] as PlanId | undefined) ?? 'free',
      };
      next();
      return;
    } catch {
      // Token invalide → traité comme anonyme (les routes protégées re-vérifient)
    }
  }
  const planHeader = req.headers['x-plan'];
  const devPlan =
    allowPlanOverride && typeof planHeader === 'string' && planHeader in PLANS
      ? (planHeader as PlanId)
      : undefined;
  req.user = { id: 'anonymous', plan: devPlan ?? 'free' };
  next();
}
