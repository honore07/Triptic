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
 *
 * Poids : posthog-js pèse ~260 Ko minifiés. Il n'entre jamais dans le bundle
 * initial — il est importé à la demande quand la télémétrie est configurée
 * ET autorisée ; les événements émis pendant le chargement sont gardés en
 * file et envoyés dès que le client est prêt.
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

type PostHogClient = typeof import('posthog-js').default;

let client: PostHogClient | null = null;
let loading: Promise<void> | null = null;
/** Événements émis avant que le client soit chargé — rejoués à l'arrivée. */
const queue: Array<[string, Record<string, string | number | boolean> | undefined]> = [];

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

/**
 * À appeler une fois au démarrage (main.tsx). Sans clé/refus : no-op.
 * Résout quand le client est prêt (les tests l'attendent ; l'app non).
 */
export function initAnalytics(): Promise<void> {
  if (loading) return loading;
  if (!analyticsEnabled()) return Promise.resolve();
  loading = import('posthog-js')
    .then(({ default: posthog }) => {
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
      client = posthog;
      for (const [event, props] of queue.splice(0)) posthog.capture(event, props);
    })
    .catch(() => {
      // Télémétrie injoignable (bloqueur, réseau) : l'app ne doit rien en savoir
      queue.length = 0;
    });
  return loading;
}

function send(event: string, props?: Record<string, string | number | boolean>): void {
  if (!loading) return; // jamais initialisé : no-op (pas de clé, refus, ou avant main)
  if (client) client.capture(event, props);
  else queue.push([event, props]);
}

/** Pageview SPA — chemin seul, jamais de query string ni de hash. */
export function trackPageview(pathname: string): void {
  send('$pageview', { $current_url: pathname });
}

/** Événement produit — propriétés limitées aux enums/compteurs. */
export function track(
  event: AnalyticsEvent,
  props?: Record<string, string | number | boolean>,
): void {
  send(event, props);
}

/** Réservé aux tests. */
export function _resetForTests(): void {
  client = null;
  loading = null;
  queue.length = 0;
}
