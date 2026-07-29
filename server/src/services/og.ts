import type { Trip } from '@triptic/shared';
import type { TripRepo } from '../repo/trips.js';

/**
 * Injection des balises Open Graph par trip sur la page publique /trip/:slug
 * (QA 1.8, item 19 Phase 4) : le HTML servi est l'index du SPA enrichi
 * côté serveur pour l'aperçu réseaux sociaux. Fallback silencieux sur
 * l'index brut si le slug est introuvable ou la BDD indisponible.
 */

/** Échappe une valeur avant insertion dans un attribut/nœud HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Description OG : résumé du trip, sinon métadonnées durée/distance/D+. */
function ogDescription(trip: Trip): string {
  // metadata vient d'un JSONB validé en z.record(z.unknown()) → on re-vérifie.
  const md = trip.metadata as Partial<Record<string, unknown>>;
  const facts: string[] = [];
  if (typeof md['duration_days'] === 'number') facts.push(`${md['duration_days']} jours`);
  if (typeof md['distance_km'] === 'number') facts.push(`${Math.round(md['distance_km'])} km`);
  if (typeof md['elevation_gain_m'] === 'number') {
    facts.push(`${Math.round(md['elevation_gain_m'])} m D+`);
  }
  const summary = typeof md['summary'] === 'string' ? md['summary'].trim() : '';
  return [summary, facts.join(' · ')].filter(Boolean).join(' — ') || trip.title;
}

/** Construit le bloc de balises OG/Twitter (valeurs échappées). */
export function buildTripOgTags(trip: Trip, pageUrl: string): string {
  const tags: [string, string][] = [
    ['og:title', trip.title],
    ['og:description', ogDescription(trip)],
  ];
  if (trip.cover_photo) tags.push(['og:image', trip.cover_photo]);
  tags.push(['og:url', pageUrl], ['og:type', 'website']);
  const lines = tags.map(
    ([property, content]) =>
      `<meta property="${escapeHtml(property)}" content="${escapeHtml(content)}" />`,
  );
  lines.push('<meta name="twitter:card" content="summary_large_image" />');
  return lines.join('\n    ');
}

/**
 * Rend l'index HTML avec les balises OG du trip identifié par son slug
 * (encodé tel que reçu dans l'URL). Toute erreur (slug inconnu, BDD down,
 * encodage invalide, pas de </head>) → index brut.
 */
export async function renderIndexWithTripOg(
  indexHtml: string,
  rawSlug: string,
  repo: TripRepo,
  appUrl: string,
): Promise<string> {
  try {
    const slug = decodeURIComponent(rawSlug);
    const trip = await repo.getBySlug(slug);
    if (!trip || !indexHtml.includes('</head>')) return indexHtml;
    const pageUrl = `${appUrl.replace(/\/+$/, '')}/trip/${encodeURIComponent(slug)}`;
    return indexHtml.replace('</head>', `${buildTripOgTags(trip, pageUrl)}\n  </head>`);
  } catch {
    // BDD indisponible → la page publique reste servie (OG génériques)
    return indexHtml;
  }
}
