import type {
  ChatMessage,
  Lang,
  ShortlistPlace,
  TripDay,
  TripGeneration,
  TripRequest,
  TripTuning,
} from '@triptic/shared';
import {
  buildCorrectorPrompt,
  buildEditPrompt,
  buildGroundingMessage,
  buildOverridesMessage,
  buildSystemPrompt,
} from './prompts.js';
import {
  correctorOutputSchema,
  editOutputSchema,
  engineOutputSchema,
  extractJson,
  type EditOutput,
  type EngineOutput,
} from './schema.js';
import { sanitizeUserInput } from './sanitize.js';
import type { LlmProvider } from './providers.js';

export * from './providers.js';
export * from './schema.js';
export * from './prompts.js';
export { sanitizeUserInput } from './sanitize.js';

export type EngineEvent =
  | {
      kind: 'status';
      step: 'extracting' | 'generating' | 'grounding' | 'validating' | 'retrying';
    }
  | { kind: 'warning'; message: string };

/** Sous ce nombre de lieux connus autour du tracé, la zone est jugée non couverte. */
export const MIN_SHORTLIST_SIZE = 5;

export interface GenerateOptions {
  lang: Lang;
  maxProposals: 1 | 3;
  /** Curseurs 1-5 du TripTuner — hyper-personnalisation du prompt. */
  tuning?: TripTuning | undefined;
  /**
   * Onboarding hybride (1.1) : valeurs d'enum TripRequest confirmées via les
   * puces de l'UI — prioritaires sur l'extraction de la conversation.
   */
  requestOverrides?: Partial<TripRequest> | undefined;
  /** Date de départ ISO (yyyy-mm-dd) — active la section saison/faisabilité. */
  startDate?: string | undefined;
  /**
   * Lieux réels (base places) autour des points donnés — active la passe de
   * grounding. Si absent ou si la zone est vide, comportement historique.
   */
  getShortlist?:
    | ((points: { lat: number; lng: number }[]) => Promise<ShortlistPlace[]>)
    | undefined;
  onEvent?: (event: EngineEvent) => void;
}

/** Résultat de la passe d'ancrage sur la base de lieux. */
export interface GroundingInfo {
  /** true si les trips ont été révisés avec les lieux réels. */
  applied: boolean;
  /** Nombre de lieux connus autour du tracé (signal de couverture, phase D). */
  shortlistSize: number;
}

export type GenerateResult =
  | {
      type: 'question';
      message: string;
      /** Suggestions de réponse rapide (chips UI), déjà dans la langue user. */
      quick_replies?: string[];
    }
  | {
      type: 'trips';
      generation: TripGeneration;
      validated: boolean;
      issues: string[];
      grounding: GroundingInfo;
    };

/**
 * Génère les 3 trips en compétition à partir d'une conversation.
 * Flow : sanitize → génération → validation par l'agent correcteur (1 retry max).
 */
export async function generateTrips(
  provider: LlmProvider,
  messages: ChatMessage[],
  opts: GenerateOptions,
): Promise<GenerateResult> {
  const emit = opts.onEvent ?? (() => {});
  const cleanMessages: ChatMessage[] = messages.map((m) =>
    m.role === 'user' ? { ...m, content: sanitizeUserInput(m.content) } : m,
  );
  if (opts.requestOverrides && Object.keys(opts.requestOverrides).length > 0) {
    // Valeurs d'enum déjà validées par Zod côté route — pas de sanitization
    cleanMessages.push({ role: 'user', content: buildOverridesMessage(opts.requestOverrides) });
  }
  const system = buildSystemPrompt(opts.lang, opts.maxProposals, opts.tuning, opts.startDate);

  emit({ kind: 'status', step: 'generating' });
  let output = await completeAndParse(provider, system, cleanMessages);

  if (output.type === 'question') {
    return {
      type: 'question',
      message: output.message,
      ...(output.quick_replies && output.quick_replies.length > 0
        ? { quick_replies: output.quick_replies }
        : {}),
    };
  }

  // Grounding — révision des trips avec les lieux RÉELS de la base places.
  // Zone non couverte (shortlist trop petite) : on garde la génération telle
  // quelle ; la taille de la shortlist sert de signal de couverture (phase D).
  const grounding: GroundingInfo = { applied: false, shortlistSize: 0 };
  if (opts.getShortlist) {
    const points = output.trips.flatMap((t) =>
      t.waypoints.map((w) => ({ lat: w.lat, lng: w.lng })),
    );
    const shortlist = await opts.getShortlist(points).catch(() => [] as ShortlistPlace[]);
    grounding.shortlistSize = shortlist.length;
    if (shortlist.length >= MIN_SHORTLIST_SIZE) {
      emit({ kind: 'status', step: 'grounding' });
      try {
        const revised = await completeAndParse(provider, system, [
          ...cleanMessages,
          { role: 'assistant', content: JSON.stringify(output) },
          { role: 'user', content: buildGroundingMessage(shortlist) },
        ]);
        if (revised.type === 'trips') {
          output = revised;
          grounding.applied = true;
        }
      } catch {
        // Le grounding ne doit jamais faire échouer une génération valide
        emit({ kind: 'warning', message: 'Grounding pass failed, keeping raw trips' });
      }
    }
  }

  // Agent correcteur — aucun trip ne s'affiche sans validation (règle qualité #5)
  emit({ kind: 'status', step: 'validating' });
  let issues = await runCorrector(provider, output);

  // Panne technique du correcteur ≠ problème de contenu : inutile de payer
  // une régénération complète (~minutes), on renvoie avec validated=false.
  const correctorDown = issues.length === 1 && issues[0] === CORRECTOR_UNAVAILABLE;

  if (issues.length > 0 && !correctorDown) {
    emit({ kind: 'status', step: 'retrying' });
    emit({ kind: 'warning', message: `Corrector found issues: ${issues.join('; ')}` });
    const retryMessages: ChatMessage[] = [
      ...cleanMessages,
      { role: 'assistant', content: JSON.stringify(output) },
      {
        role: 'user',
        content: `L'agent de validation a détecté ces problèmes : ${issues.join('; ')}. Régénère les 3 trips corrigés, même format JSON strict.`,
      },
    ];
    const retried = await completeAndParse(provider, system, retryMessages);
    if (retried.type === 'trips') {
      output = retried;
      issues = await runCorrector(provider, output);
    }
  }

  return {
    type: 'trips',
    generation: {
      trips: output.trips,
      differentiator: output.differentiator,
      request: output.request,
    },
    validated: issues.length === 0,
    issues,
    grounding,
  };
}

export interface EditTripOptions {
  lang: Lang;
  onEvent?: (event: EngineEvent) => void;
}

export type EditTripResult =
  | { type: 'question'; message: string }
  | { type: 'edit'; days: TripDay[]; validated: boolean; issues: string[] };

/**
 * Édition conversationnelle d'un trip (roadmap 3.2) : une instruction en
 * langage naturel modifie l'activité/le jour ciblé dans la structure days[].
 * Toujours validé par l'agent correcteur (règle qualité #5), 1 retry max.
 */
export async function editTrip(
  provider: LlmProvider,
  trip: { title: string; mode: string; days: unknown },
  instruction: string,
  opts: EditTripOptions,
): Promise<EditTripResult> {
  const emit = opts.onEvent ?? (() => {});
  const messages: ChatMessage[] = [
    {
      role: 'user',
      content: `TRIP ACTUEL :\n${JSON.stringify({ title: trip.title, mode: trip.mode, days: trip.days })}\n\nINSTRUCTION :\n${sanitizeUserInput(instruction)}`,
    },
  ];
  const system = buildEditPrompt(opts.lang);

  emit({ kind: 'status', step: 'generating' });
  const raw = await provider.complete({ system, messages, maxTokens: 32000 });
  let output: EditOutput = editOutputSchema.parse(extractJson(raw));
  if (output.type === 'question') {
    return { type: 'question', message: output.message };
  }

  emit({ kind: 'status', step: 'validating' });
  let issues = await correctDays(provider, output.days);
  const correctorDown = issues.length === 1 && issues[0] === CORRECTOR_UNAVAILABLE;

  if (issues.length > 0 && !correctorDown) {
    emit({ kind: 'status', step: 'retrying' });
    const retried = await provider.complete({
      system,
      messages: [
        ...messages,
        { role: 'assistant', content: JSON.stringify(output) },
        {
          role: 'user',
          content: `L'agent de validation a détecté ces problèmes : ${issues.join('; ')}. Corrige, même format JSON strict.`,
        },
      ],
      maxTokens: 32000,
    });
    const reparsed = editOutputSchema.parse(extractJson(retried));
    if (reparsed.type === 'edit') {
      output = reparsed;
      issues = await correctDays(provider, output.days);
    }
  }

  return {
    type: 'edit',
    days: output.days,
    validated: issues.length === 0,
    issues,
  };
}

async function correctDays(provider: LlmProvider, days: unknown): Promise<string[]> {
  try {
    const raw = await provider.correct({
      system: buildCorrectorPrompt(),
      messages: [{ role: 'user', content: JSON.stringify({ trips: [{ days }] }) }],
      maxTokens: 2000,
    });
    const verdict = correctorOutputSchema.parse(extractJson(raw));
    return verdict.valid ? [] : verdict.issues;
  } catch {
    return [CORRECTOR_UNAVAILABLE];
  }
}

async function completeAndParse(
  provider: LlmProvider,
  system: string,
  messages: ChatMessage[],
): Promise<EngineOutput> {
  // Les longs road trips (10 j+) produisent un gros JSON : large marge de sortie
  const raw = await provider.complete({ system, messages, maxTokens: 32000 });
  return engineOutputSchema.parse(extractJson(raw));
}

const CORRECTOR_UNAVAILABLE = 'corrector_unavailable';

async function runCorrector(provider: LlmProvider, output: EngineOutput): Promise<string[]> {
  if (output.type !== 'trips') return [];
  try {
    const raw = await provider.correct({
      system: buildCorrectorPrompt(),
      messages: [{ role: 'user', content: JSON.stringify({ trips: output.trips }) }],
      maxTokens: 2000,
    });
    const verdict = correctorOutputSchema.parse(extractJson(raw));
    return verdict.valid ? [] : verdict.issues;
  } catch {
    // Le correcteur ne doit jamais bloquer la génération : en cas d'échec
    // technique on renvoie les trips avec validated=false côté appelant.
    return [CORRECTOR_UNAVAILABLE];
  }
}
