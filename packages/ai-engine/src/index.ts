import type { ChatMessage, Lang, TripGeneration } from '@triptic/shared';
import { buildCorrectorPrompt, buildSystemPrompt } from './prompts.js';
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
  | { kind: 'status'; step: 'extracting' | 'generating' | 'validating' | 'retrying' }
  | { kind: 'warning'; message: string };

export interface GenerateOptions {
  lang: Lang;
  maxProposals: 1 | 3;
  onEvent?: (event: EngineEvent) => void;
}

export type GenerateResult =
  | { type: 'question'; message: string }
  | { type: 'trips'; generation: TripGeneration; validated: boolean; issues: string[] };

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
  const system = buildSystemPrompt(opts.lang, opts.maxProposals);

  emit({ kind: 'status', step: 'generating' });
  let output = await completeAndParse(provider, system, cleanMessages);

  if (output.type === 'question') {
    return { type: 'question', message: output.message };
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
