import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { PlanId } from '@triptic/shared';
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
 * avec override du plan via le header x-plan (jamais en production).
 */
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
  const devPlan = !env.isProd ? (req.headers['x-plan'] as PlanId | undefined) : undefined;
  req.user = { id: 'anonymous', plan: devPlan ?? 'free' };
  next();
}
