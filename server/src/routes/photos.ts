import { Router } from 'express';
import { z } from 'zod';
import { findPlacePhotos } from '../services/photos.js';

const querySchema = z.object({
  q: z.string().trim().min(2).max(120),
  limit: z.coerce.number().int().min(1).max(15).optional(),
});

/**
 * Galerie photo d'un lieu — alimente le carrousel de la carte.
 * Public (les trips partagés y ont droit) et en lecture seule ; le service
 * met en cache 24 h pour tenir dans le quota Unsplash (50 req/h).
 */
export function createPhotosRouter(): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_query' });
      return;
    }
    const media = await findPlacePhotos(parsed.data.q, parsed.data.limit ?? 10);
    // Les galeries changent rarement : cache navigateur d'une heure
    res.set('Cache-Control', 'public, max-age=3600');
    res.json({ media });
  });

  return router;
}
