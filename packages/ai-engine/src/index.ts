import type {
  ChatMessage,
  Lang,
  ShortlistPlace,
  TripGeneration,
  TripTuning,
} from '@triptic/shared';
import { buildCorrectorPrompt, buildGroundingMessage, buildSystemPrompt } from './prompts.js';
import {
  correctorOutputSchema,
  engineOutputSchema,
  extractJson,
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
  | { type: 'question'; message: string }
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
  const system = buildSystemPrompt(opts.lang, opts.maxProposals, opts.tuning);

  emit({ kind: 'status', step: 'generating' });
  let output = await completeAndParse(provider, system, cleanMessages);

  if (output.type === 'question') {
    return { type: 'question', message: output.message };
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
