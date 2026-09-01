import { Router } from 'express';
import { z } from 'zod';
import type { LlmProvider } from '@triptic/ai-engine';
import { logger } from '../logger.js';
import type { GalleryStore } from '../repo/galleries.js';
import { findPlacePhotos } from '../services/photos.js';
import type { EnrichmentService } from '../services/enrichment.js';

/**
 * Tâches de fond déclenchées par n8n (CRON), jamais par un visiteur.
 *
 * Le partage est volontaire : n8n ordonnance, réessaie et garde l'historique
 * d'exécution ; le métier reste ici, là où vivent déjà les clés d'API, l'agent
 * photo et la base. Un workflow n8n qui referait ce travail nœud par nœud
 * dupliquerait tout ça sans rien apporter.
 */

const precomputeSchema = z.object({
  /** Nombre de lieux traités par passage — borné pour tenir dans une nuit. */
  limit: z.coerce.number().int().min(1).max(200).default(25),
  /** Une galerie plus ancienne que ça est refaite. */
  max_age_days: z.coerce.number().int().min(1).max(365).default(90),
});

/**
 * Protection : secret partagé avec n8n. Sans MAINTENANCE_TOKEN configuré, la
 * route reste fermée — on ne veut pas d'un déclencheur ouvert par défaut.
 */
function authorize(header: string | undefined): boolean {
  const expected = process.env['MAINTENANCE_TOKEN'];
  if (!expected || expected.length < 16) return false;
  return header === expected;
}

export function createMaintenanceRouter(
  galleryStore: GalleryStore | undefined,
  provider: LlmProvider,
  enrichment?: EnrichmentService | undefined,
): Router {
  const router = Router();

  /**
   * POST /api/maintenance/precompute-galleries
   * Remplit à l'avance les galeries des lieux les plus notoires : le carrousel
   * devient une lecture en base, sans attente Wikimedia ni agent photo.
   */
  router.post('/precompute-galleries', async (req, res) => {
    if (!authorize(req.get('x-maintenance-token'))) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    if (!galleryStore) {
      res.status(503).json({ error: 'no_database' });
      return;
    }
    const parsed = precomputeSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_body' });
      return;
    }

    const { limit, max_age_days } = parsed.data;
    let targets: { query: string; lat: number; lng: number }[];
    try {
      targets = await galleryStore.staleTargets(limit, max_age_days);
    } catch (error) {
      logger.error({ error, context: 'precompute-galleries' }, 'Target selection failed');
      res.status(500).json({ error: 'query_failed' });
      return;
    }

    let filled = 0;
    let empty = 0;
    for (const target of targets) {
      try {
        // findPlacePhotos écrit lui-même dans le store (voir photos.ts).
        const media = await findPlacePhotos(target.query, 10, target, provider);
        if (media.length > 0) filled += 1;
        else empty += 1;
      } catch (error) {
        empty += 1;
        logger.warn({ error, place: target.query }, 'Gallery precompute failed for place');
      }
    }

    logger.info({ examined: targets.length, filled, empty }, 'Galleries precomputed');
    res.json({ examined: targets.length, filled, empty });
  });

  const drainSchema = z.object({
    limit: z.coerce.number().int().min(1).max(50).default(10),
  });

  /**
   * POST /api/maintenance/drain-enrichment
   * Reprend les zones restées en attente : l'enrichissement démarre tout de
   * suite après une génération, mais un redémarrage du process en plein
   * traitement laissait la zone dans les limbes. Ici elle est reprise.
   */
  router.post('/drain-enrichment', async (req, res) => {
    if (!authorize(req.get('x-maintenance-token'))) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    if (!enrichment) {
      res.status(503).json({ error: 'no_database' });
      return;
    }
    const parsed = drainSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_body' });
      return;
    }
    try {
      const processed = await enrichment.drainPending(parsed.data.limit);
      logger.info({ processed }, 'Zones en attente reprises');
      res.json({ processed });
    } catch (error) {
      logger.error({ error, context: 'drain-enrichment' }, 'Drain failed');
      res.status(500).json({ error: 'drain_failed' });
    }
  });

  return router;
}
