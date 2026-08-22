import posthog from 'posthog-js';

/**
 * Mesure d'audience & activation — PostHog UE, mode « sans cookie ».
 *
 * Conformité (CLAUDE.md règle 9 : pas de tracking tiers sans consentement) :
 * - `persistence: 'memory'` → RIEN n'est écrit sur le terminal (ni cookie ni
 *   localStorage), donc pas de traçage d'individus entre visites : chaque
 *   session est anonyme et indépendante (régime CNIL de la mesure d'audience
 *   exemptée, pas de bannière requise).
 * - Hébergement UE (eu.i.posthog.com) par défaut.
 * - `autocapture` désactivé : on n'envoie QUE les événements explicites
 *   ci-dessous, jamais de contenu saisi (la demande de trip est une donnée
 *   personnelle), jamais d'email ni de coordonnées — uniquement des enums et
 *   des compteurs. Session recording désactivé.
 * - Respect de Do Not Track, et opt-out manuel documenté dans la page
 *   Confidentialité : `localStorage['triptic-analytics'] = 'off'`.
 *
 * Sans VITE_POSTHOG_KEY, tout est inerte (même dégradation que Mapbox et
 * Supabase) — les appels track() sont des no-ops.
 */

const KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) || 'https://eu.i.posthog.com';

/** Événements produit autorisés (liste fermée — pas de texte libre). */
export type AnalyticsEvent =
  | 'trip_generation_started'
  | 'trip_generation_result'
  | 'trip_generation_question'
  | 'trip_generation_error'
  | 'mode_selected'
  | 'trip_chosen'
  | 'trip_saved'
  | 'trip_shared'
  | 'gpx_exported'
  | 'paywall_opened'
  | 'plan_upgraded'
  | 'auth_signed_in';

let ready = false;

function optedOut(): boolean {
  try {
    if (navigator.doNotTrack === '1') return true;
    return localStorage.getItem('triptic-analytics') === 'off';
  } catch {
    return true;
  }
}

/** Vrai si la télémétrie est configurée ET autorisée sur ce navigateur. */
export function analyticsEnabled(): boolean {
  return Boolean(KEY && !KEY.startsWith('phc_xxx')) && !optedOut();
}

/** À appeler une fois au démarrage (main.tsx). Sans clé/refus : no-op. */
export function initAnalytics(): void {
  if (ready || !analyticsEnabled()) return;
  posthog.init(KEY!, {
    api_host: HOST,
    persistence: 'memory', // sans cookie — anonyme par session
    person_profiles: 'identified_only', // jamais identify() → jamais de profil
    autocapture: false,
    capture_pageview: false, // SPA : envoyé manuellement via le router
    capture_pageleave: false,
    disable_session_recording: true,
    advanced_disable_decide: true, // pas d'appel /decide (pas de feature flags)
  });
  ready = true;
}

/** Pageview SPA — chemin seul, jamais de query string ni de hash. */
export function trackPageview(pathname: string): void {
  if (!ready) return;
  posthog.capture('$pageview', { $current_url: pathname });
}

/** Événement produit — propriétés limitées aux enums/compteurs. */
export function track(
  event: AnalyticsEvent,
  props?: Record<string, string | number | boolean>,
): void {
  if (!ready) return;
  posthog.capture(event, props);
}

/** Réservé aux tests. */
export function _resetForTests(): void {
  ready = false;
}
