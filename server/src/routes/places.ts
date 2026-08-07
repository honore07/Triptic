import { Router, type Response } from 'express';
import { z } from 'zod';
import type { PlaceKind, ShortlistPlace } from '@triptic/shared';
import { logger } from '../logger.js';
import { normalizeUserId } from '../repo/pgTrips.js';
import type { RoutingService } from '../services/routing.js';

const PLACE_KINDS: [PlaceKind, ...PlaceKind[]] = [
  'peak',
  'pass',
  'lake',
  'waterfall',
  'gorge',
  'glacier',
  'viewpoint',
  'refuge',
  'camp',
  'castle',
  'village',
  'museum',
  'attraction',
  'poi',
];

/** Tous les kinds interrogeables en bbox (contributions + food 0.4 + rando 5.1). */
export const SEARCHABLE_KINDS: [PlaceKind, ...PlaceKind[]] = [
  ...PLACE_KINDS,
  'restaurant',
  'cafe',
  'bar',
  'fast_food',
  'trail',
];

const submitSchema = z.object({
  name: z.string().min(2).max(120),
  kind: z.enum(PLACE_KINDS),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  summary: z.string().max(200).optional(),
});

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
});

const nearbySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radius: z.coerce.number().min(100).max(50000).default(10000),
});

/** « Search this area » (4.1/4.2) : zone visible de la carte + filtres. */
const bboxSchema = z
  .object({
    south: z.coerce.number().min(-90).max(90),
    west: z.coerce.number().min(-180).max(180),
    north: z.coerce.number().min(-90).max(90),
    east: z.coerce.number().min(-180).max(180),
    /** Liste de kinds séparés par des virgules (ex. "restaurant,cafe"). */
    kinds: z
      .string()
      .transform((s) => s.split(',').filter(Boolean))
      .pipe(z.array(z.enum(SEARCHABLE_KINDS)).max(SEARCHABLE_KINDS.length))
      .optional(),
    /** Point de départ (géoloc ou départ du jour) → temps de trajet GraphHopper. */
    from_lat: z.coerce.number().min(-90).max(90).optional(),
    from_lng: z.coerce.number().min(-180).max(180).optional(),
    travel_mode: z.enum(['car', 'foot', 'bike']).default('car'),
  })
  .refine((b) => b.south < b.north && b.west < b.east, { message: 'invalid bbox' });

/** Nombre de résultats dont on calcule le temps de trajet (coût routing borné). */
const TRAVEL_TIME_TOP = 12;

/** Boucles rando près d'un point (5.2). */
const trailsSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radius: z.coerce.number().min(500).max(30000).default(10000),
  /** Distance journalière souhaitée (km) — tri par proximité de cette cible. */
  target_km: z.coerce.number().min(1).max(60).optional(),
  mode: z.enum(['foot', 'bike']).default('foot'),
});

/**
 * Nombre minimum de propositions visé sur la page Explore : en dessous,
 * l'utilisateur a l'impression que la zone est vide. Les lieux (bbox) en
 * renvoient déjà 50 ; les boucles rando sont complétées par génération.
 */
const MIN_SUGGESTIONS = 10;

/** Graines tentées en plus du strict nécessaire (échecs + doublons). */
const SEED_OVERSHOOT = 4;

/** Facteurs d'élargissement successifs d'une zone trop pauvre en résultats. */
const BBOX_WIDEN_STEPS = [2.5, 6] as const;

export interface Bbox {
  south: number;
  west: number;
  north: number;
  east: number;
}

/**
 * Agrandit une bbox d'un facteur autour de son centre, en restant dans des
 * bornes géographiques valides (une bbox hors bornes fait échouer PostGIS).
 */
export function expandBbox(bbox: Bbox, factor: number): Bbox {
  const midLat = (bbox.south + bbox.north) / 2;
  const midLng = (bbox.west + bbox.east) / 2;
  const halfLat = ((bbox.north - bbox.south) / 2) * factor;
  const halfLng = ((bbox.east - bbox.west) / 2) * factor;
  return {
    south: Math.max(-90, midLat - halfLat),
    north: Math.min(90, midLat + halfLat),
    west: Math.max(-180, midLng - halfLng),
    east: Math.min(180, midLng + halfLng),
  };
}

/** Une boucle proposée à l'utilisateur — mappée (base) ou générée (GraphHopper). */
export interface TrailSuggestion {
  id: string;
  name: string | null;
  summary: string | null;
  notoriety: number;
  source: string;
  distance_km: number;
  duration_min: number;
  elevation_gain_m?: number;
  geometry: [number, number][];
  generated: boolean;
}

/**
 * Deux boucles générées depuis le même point se ressemblent trop pour être
 * proposées ensemble si distance ET dénivelé sont quasi identiques — sans ce
 * filtre, plusieurs graines produisent visuellement la même rando.
 */
export function isDuplicateLoop(
  loop: { distance_km: number; elevation_gain_m: number },
  existing: { distance_km: number; elevation_gain_m?: number; generated: boolean }[],
): boolean {
  return existing.some(
    (other) =>
      other.generated &&
      Math.abs(other.distance_km - loop.distance_km) < 0.3 &&
      Math.abs((other.elevation_gain_m ?? 0) - loop.elevation_gain_m) < 30,
  );
}

/**
 * Temps de marche estimé (Naismith grade-ajusté) : 4,5 km/h + 1 min/10 m D+.
 * Utilisé pour les boucles mappées sans durée source.
 */
export function hikeDurationMin(distanceKm: number, elevationGainM: number): number {
  return Math.round((distanceKm / 4.5) * 60 + elevationGainM / 10);
}

/** Interface du repo côté routes — PgPlaceRepo la satisfait structurellement. */
export interface PlacesApi {
  findNearby(
    lat: number,
    lng: number,
    radiusM: number,
    limit: number,
  ): Promise<(ShortlistPlace & { id: string })[]>;
  findInBbox(
    bbox: { south: number; west: number; north: number; east: number },
    kinds: PlaceKind[] | undefined,
    limit: number,
  ): Promise<(ShortlistPlace & { id: string })[]>;
  findTrailsNear(
    lat: number,
    lng: number,
    radiusM: number,
    targetKm: number | null,
    limit: number,
  ): Promise<
    {
      id: string;
      name: string;
      summary: string | null;
      notoriety: number;
      source: string;
      distance_km: number;
      geometry: [number, number][];
    }[]
  >;
  submitUserPlace(input: {
    name: string;
    kind: PlaceKind;
    lat: number;
    lng: number;
    summary?: string | null;
    userId?: string | null;
  }): Promise<'pending' | 'merged'>;
  addReview(
    placeId: string,
    userId: string | null,
    rating: number,
    comment: string | null,
  ): Promise<boolean>;
  statsSummary(): Promise<{
    total: number;
    pending: number;
    by_region: { region: string | null; count: number }[];
    by_source: { source: string; count: number }[];
  }>;
}

/**
 * Contributions utilisateurs (phase E) + monitoring :
 *   GET  /api/places/stats             santé de la base (n8n, rapport hebdo)
 *   GET  /api/places/nearby            lieux actifs autour d'un point
 *   POST /api/places                   proposer un lieu (statut pending, modéré)
 *   POST /api/places/:id/reviews       noter un lieu (fait évoluer sa confiance)
 */
/**
 * @param repo absent = pas de base configurée (dev local sans DATABASE_URL).
 *   Les routes qui exigent PostGIS répondent alors 503 `db_unavailable` —
 *   explicite et distinguable côté client d'une erreur de validation (400).
 *   `/trails` reste utilisable : il bascule sur la boucle générée GraphHopper.
 */
export function createPlacesRouter(repo?: PlacesApi, routing?: RoutingService): Router {
  const router = Router();

  /** Réponse commune aux routes qui ne peuvent rien faire sans PostGIS. */
  const dbUnavailable = (res: Response): void => {
    res.status(503).json({ error: 'db_unavailable' });
  };

  /**
   * GET /api/places/bbox — « search this area » (4.2) : lieux de la zone
   * visible, triés par notoriété, avec temps de trajet GraphHopper depuis
   * from_lat/from_lng pour les premiers résultats.
   */
  router.get('/bbox', async (req, res) => {
    const parsed = bboxSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_query', details: parsed.error.flatten() });
      return;
    }
    const { south, west, north, east, kinds, from_lat, from_lng, travel_mode } = parsed.data;
    if (!repo) return dbUnavailable(res);
    try {
      // Zone pauvre (rural, filtre étroit comme « spots de nuit ») : on
      // élargit progressivement plutôt que de renvoyer 3 résultats — sinon
      // l'utilisateur croit qu'il n'y a rien, alors que tout est à 10 km.
      let bbox = { south, west, north, east };
      let widened = false;
      let places = (await repo.findInBbox(bbox, kinds, 50)) as (ShortlistPlace & {
        id: string;
        travel_min?: number;
      })[];
      for (const factor of BBOX_WIDEN_STEPS) {
        if (places.length >= MIN_SUGGESTIONS) break;
        bbox = expandBbox({ south, west, north, east }, factor);
        places = (await repo.findInBbox(bbox, kinds, 50)) as (ShortlistPlace & {
          id: string;
          travel_min?: number;
        })[];
        widened = true;
      }
      if (routing?.enabled && from_lat !== undefined && from_lng !== undefined) {
        await Promise.all(
          places.slice(0, TRAVEL_TIME_TOP).map(async (place) => {
            const leg = await routing.route(
              [
                { lat: from_lat, lng: from_lng },
                { lat: place.lat, lng: place.lng },
              ],
              travel_mode,
            );
            if (leg) place.travel_min = leg.duration_min;
          }),
        );
      }
      // `widened` : l'UI peut signaler que des résultats sont hors du cadre
      // visible (ils sont volontairement conservés — mieux qu'une liste vide).
      res.json({ places, ...(widened ? { widened: true } : {}) });
    } catch (error) {
      logger.error({ error, context: 'places-bbox' }, 'Bbox search failed');
      res.status(500).json({ error: 'places_unavailable' });
    }
  });

  /**
   * GET /api/places/trails — suggestion de boucles rando (5.2) :
   * les vraies boucles mappées (Geotrek/OSM) d'abord, triées par proximité
   * de la distance cible ; zone sous-couverte → boucle GÉNÉRÉE via
   * GraphHopper round-trip (flaguée generated:true dans la réponse).
   */
  router.get('/trails', async (req, res) => {
    const parsed = trailsSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_query', details: parsed.error.flatten() });
      return;
    }
    const { lat, lng, radius, target_km, mode } = parsed.data;
    try {
      // Sans base : pas de boucle mappée à proposer, mais la génération
      // GraphHopper reste possible — c'est elle qui porte le mode « journée ».
      const trails = repo
        ? await repo.findTrailsNear(lat, lng, radius, target_km ?? null, MIN_SUGGESTIONS)
        : [];
      const withDuration: TrailSuggestion[] = trails.map((trail) => ({
        ...trail,
        generated: false,
        duration_min: hikeDurationMin(trail.distance_km, 0),
      }));
      if (withDuration.length >= MIN_SUGGESTIONS) {
        res.json({ trails: withDuration });
        return;
      }
      if (!routing?.enabled) {
        // Le routeur complète les zones sans boucle mappée. Sans lui ET sans
        // boucle en base, le dire — plutôt qu'une liste vide que l'UI
        // présenterait comme « aucun résultat dans cette zone ».
        if (withDuration.length > 0) {
          res.json({ trails: withDuration });
          return;
        }
        res.status(503).json({ error: repo ? 'routing_unavailable' : 'db_unavailable' });
        return;
      }
      // On complète jusqu'à MIN_SUGGESTIONS avec des boucles générées sur le
      // réseau OSM piéton. Chaque graine change le cap de départ, donc la
      // rando obtenue : on en tente plus que nécessaire car certaines
      // échouent ou retombent sur un tracé déjà proposé.
      const missing = MIN_SUGGESTIONS - withDuration.length;
      const seeds = Array.from({ length: missing + SEED_OVERSHOOT }, (_, i) => i);
      const loops = await Promise.all(
        seeds.map((seed) => routing.roundTrip({ lat, lng }, target_km ?? 12, mode, seed)),
      );
      for (const [index, loop] of loops.entries()) {
        if (!loop || withDuration.length >= MIN_SUGGESTIONS) continue;
        if (isDuplicateLoop(loop, withDuration)) continue;
        withDuration.push({
          id: `generated-${index}`,
          name: null,
          summary: null,
          notoriety: 0,
          source: 'graphhopper',
          distance_km: loop.distance_km,
          duration_min: loop.duration_min,
          elevation_gain_m: loop.elevation_gain_m,
          geometry: loop.geometry,
          generated: true,
        });
      }
      res.json({ trails: withDuration });
    } catch (error) {
      logger.error({ error, context: 'places-trails' }, 'Trails search failed');
      res.status(500).json({ error: 'places_unavailable' });
    }
  });

  router.get('/stats', async (_req, res) => {
    if (!repo) return dbUnavailable(res);
    try {
      res.json(await repo.statsSummary());
    } catch (error) {
      logger.error({ error, context: 'places-stats' }, 'Places stats failed');
      res.status(500).json({ error: 'places_unavailable' });
    }
  });

  router.get('/nearby', async (req, res) => {
    const parsed = nearbySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_query', details: parsed.error.flatten() });
      return;
    }
    if (!repo) return dbUnavailable(res);
    try {
      const { lat, lng, radius } = parsed.data;
      const places = await repo.findNearby(lat, lng, radius, 50);
      res.json({ places });
    } catch (error) {
      logger.error({ error, context: 'places-nearby' }, 'Nearby places failed');
      res.status(500).json({ error: 'places_unavailable' });
    }
  });

  router.post('/', async (req, res) => {
    const parsed = submitSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
      return;
    }
    // Validation OK mais rien où l'écrire : 503 explicite, jamais confondu
    // côté UI avec un refus de validation.
    if (!repo) return dbUnavailable(res);
    try {
      const status = await repo.submitUserPlace({
        ...parsed.data,
        summary: parsed.data.summary ?? null,
        userId: normalizeUserId(req.user.id),
      });
      res.status(201).json({ status });
    } catch (error) {
      logger.error({ error, context: 'places-submit' }, 'Place submission failed');
      res.status(500).json({ error: 'places_unavailable' });
    }
  });

  router.post('/:id/reviews', async (req, res) => {
    const parsed = reviewSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
      return;
    }
    if (!repo) return dbUnavailable(res);
    try {
      const ok = await repo.addReview(
        req.params['id'] as string,
        normalizeUserId(req.user.id),
        parsed.data.rating,
        parsed.data.comment ?? null,
      );
      if (!ok) {
        res.status(404).json({ error: 'place_not_found' });
        return;
      }
      res.status(201).json({ ok: true });
    } catch (error) {
      logger.error({ error, context: 'places-review' }, 'Place review failed');
      res.status(500).json({ error: 'places_unavailable' });
    }
  });

  return router;
}
