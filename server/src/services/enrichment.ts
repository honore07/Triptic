/**
 * Auto-enrichissement de la base de lieux (phase D).
 *
 * Quand une génération sort avec une couverture faible (shortlist < seuil),
 * un job de fond aspire les POI OSM de la zone et les insère : le prochain
 * utilisateur qui demande cette zone profite d'une base remplie.
 *
 * NOTE ARCHITECTURE : file en mémoire (1 job à la fois, dédup par zone).
 * Migration BullMQ prévue quand Redis sera installé sur le VPS — inutile
 * d'ajouter la dépendance avant (CLAUDE.md § infrastructure).
 */
import { MIN_SHORTLIST_SIZE } from '@triptic/ai-engine';
import { logger } from '../logger.js';
import { regionForPoint, type Bbox } from '../import/osm/regions.js';
import { OSM_CATEGORIES, buildOverpassQuery } from '../import/osm/categories.js';
import { fetchOverpass } from '../import/osm/overpassClient.js';
import { osmElementToPlace } from '../import/osm/mapElement.js';
import type { PgPlaceRepo, PlaceInput } from '../repo/places.js';

/** Catégories prioritaires pour un remplissage express d'une zone inconnue. */
const QUICK_KINDS = new Set(['peak', 'lake', 'waterfall', 'viewpoint', 'refuge', 'camp', 'castle']);

/** Marge autour du tracé (degrés ≈ 15 km) pour la bbox d'enrichissement. */
const BBOX_MARGIN = 0.15;

/** Bbox englobante des points d'un trip, avec marge. */
export function bboxForPoints(points: { lat: number; lng: number }[]): Bbox | null {
  if (points.length === 0) return null;
  let south = Infinity;
  let north = -Infinity;
  let west = Infinity;
  let east = -Infinity;
  for (const p of points) {
    south = Math.min(south, p.lat);
    north = Math.max(north, p.lat);
    west = Math.min(west, p.lng);
    east = Math.max(east, p.lng);
  }
  return {
    south: south - BBOX_MARGIN,
    north: north + BBOX_MARGIN,
    west: west - BBOX_MARGIN,
    east: east + BBOX_MARGIN,
  };
}

/** Clé de dédup d'une zone (bbox arrondie au demi-degré ≈ 50 km). */
export function zoneKey(bbox: Bbox): string {
  const r = (v: number): number => Math.round(v * 2) / 2;
  return `${r(bbox.south)},${r(bbox.west)},${r(bbox.north)},${r(bbox.east)}`;
}

export interface EnrichmentDeps {
  /** Injectable pour les tests. */
  fetchImpl?: typeof fetchOverpass;
  /** Webhook n8n notifié après chaque enrichissement (optionnel). */
  webhookUrl?: string | undefined;
}

export class EnrichmentService {
  /** Zones déjà traitées ou en cours (cooldown process — pas de re-scan). */
  private readonly seenZones = new Set<string>();
  private running = false;
  private readonly queue: Bbox[] = [];

  constructor(
    private readonly repo: Pick<PgPlaceRepo, 'bulkUpsert'>,
    private readonly deps: EnrichmentDeps = {},
  ) {}

  /**
   * À appeler après chaque génération (fire-and-forget) : déclenche un
   * enrichissement de fond si la zone est sous-couverte.
   */
  maybeEnrich(points: { lat: number; lng: number }[], shortlistSize: number): void {
    if (shortlistSize >= MIN_SHORTLIST_SIZE) return;
    const bbox = bboxForPoints(points);
    if (!bbox) return;
    const key = zoneKey(bbox);
    if (this.seenZones.has(key)) return;
    this.seenZones.add(key);
    this.queue.push(bbox);
    void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      let bbox = this.queue.shift();
      while (bbox) {
        await this.enrichZone(bbox).catch((error) => {
          logger.error({ error }, 'Auto-enrichissement échoué');
        });
        bbox = this.queue.shift();
      }
    } finally {
      this.running = false;
    }
  }

  private async enrichZone(bbox: Bbox): Promise<void> {
    const fetchImpl = this.deps.fetchImpl ?? fetchOverpass;
    const categories = OSM_CATEGORIES.filter((c) => QUICK_KINDS.has(c.kind));
    let added = 0;
    for (const category of categories) {
      const elements = await fetchImpl(buildOverpassQuery(category, bbox));
      const center = { lat: (bbox.south + bbox.north) / 2, lng: (bbox.west + bbox.east) / 2 };
      const region = regionForPoint(center.lat, center.lng);
      const inputs = elements
        .map((el) => osmElementToPlace(el, category, region))
        .filter((p): p is PlaceInput => p !== null);
      if (inputs.length > 0) await this.repo.bulkUpsert(inputs);
      added += inputs.length;
    }
    logger.info({ zone: zoneKey(bbox), added }, 'Zone auto-enrichie (OSM)');
    if (this.deps.webhookUrl) {
      await fetch(this.deps.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'zone_enriched', zone: zoneKey(bbox), added }),
      }).catch(() => undefined); // notification best-effort
    }
  }
}
