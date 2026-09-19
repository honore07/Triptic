import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import type { ChatMessage } from '@triptic/shared';

/**
 * Effort de raisonnement demandé au modèle (Deepseek v4 `reasoning_effort`).
 * Mesuré le 04/09/2026 sur une liste de 12 villages : sans consigne, le
 * modèle a brûlé 4 000 tokens de réflexion en 31 s et rendu un contenu VIDE ;
 * « low » : 7 s, 548 tokens de réflexion, réponse complète ; « none » : 2,4 s.
 * - 'none' : tâches de classement (agent photo) — réfléchir n'apporte rien ;
 * - 'low'  : génération et édition de trips (défaut) — un peu de géographie ;
 * - 'full' : laisser le modèle décider (agent correcteur sur le reasoner).
 */
export type ReasoningEffort = 'none' | 'low' | 'full';

export interface CompleteOptions {
  system: string;
  messages: ChatMessage[];
  maxTokens?: number;
  reasoning?: ReasoningEffort;
}

export interface LlmProvider {
  name: string;
  /** Modèle utilisé pour la génération principale. */
  complete(opts: CompleteOptions): Promise<string>;
  /** Modèle utilisé pour l'agent correcteur (raisonnement). */
  correct(opts: CompleteOptions): Promise<string>;
}

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';

/**
 * Les très longues générations en streaming (road trips 10 j+, ~5 min)
 * peuvent subir une coupure réseau transitoire (ECONNRESET). Le SDK ne
 * retente pas un stream interrompu en cours de route : on retente ici.
 */
async function withNetworkRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? `${error.message} ${error.cause ?? ''}` : '';
      const transient = /ECONNRESET|ETIMEDOUT|ECONNREFUSED|EPIPE|fetch failed|Connection error|aborted/i.test(
        message,
      );
      if (!transient || i === attempts - 1) throw error;
    }
  }
  throw lastError;
}

/**
 * Modèles Deepseek — gamme v4 depuis juillet 2026 (deepseek-chat et
 * deepseek-reasoner retirés par Deepseek). Surchargeables par env pour
 * survivre au prochain renommage sans redéploiement de code.
 */
const DEEPSEEK_CHAT_MODEL = process.env['DEEPSEEK_CHAT_MODEL'] ?? 'deepseek-v4-flash';
const DEEPSEEK_REASONER_MODEL = process.env['DEEPSEEK_REASONER_MODEL'] ?? 'deepseek-v4-pro';

/**
 * Silence maximal toléré de Deepseek, en ms, avant d'abandonner l'appel.
 * Le 14/09/2026, Deepseek saturé acceptait les connexions sans jamais
 * répondre (il garde la connexion ouverte jusqu'à 30 min avec des
 * « : keep-alive ») : le fallback, qui ne se déclenche que sur erreur,
 * n'arrivait jamais. Mesuré le 18/09/2026 en streaming : premier fragment
 * utile en 0,6-1 s (flash comme pro), puis un fragment au moins toutes les
 * 0,25 s. 30 s de silence = panne, pas lenteur. Le délai se réarme à chaque
 * fragment : un road trip de 16 jours (~5 min) n'est jamais coupé tant
 * qu'il progresse. Surchargeable par DEEPSEEK_IDLE_TIMEOUT_MS.
 */
const DEFAULT_IDLE_TIMEOUT_MS = 30_000;

function idleTimeoutFromEnv(): number {
  const value = Number(process.env['DEEPSEEK_IDLE_TIMEOUT_MS']);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_IDLE_TIMEOUT_MS;
}

export function createDeepseekProvider(
  apiKey: string,
  { idleTimeoutMs = idleTimeoutFromEnv() }: { idleTimeoutMs?: number } = {},
): LlmProvider {
  const client = new OpenAI({ baseURL: DEEPSEEK_BASE_URL, apiKey });

  /**
   * Deepseek v4 raisonne avant de répondre et ses tokens de raisonnement
   * comptent dans max_tokens : quand le budget est mangé par la réflexion,
   * l'API renvoie finish_reason « length » et un contenu VIDE — que le
   * parseur JSON prenait pour une réponse malformée, sans jamais basculer
   * sur le fallback. Ici : un contenu vide est une erreur (le fallback
   * Anthropic reprend), et un budget épuisé est retenté une fois avec le
   * double, avant de renoncer.
   *
   * L'appel est streamé pour surveiller la progression : sans aucun
   * fragment utile (ni contenu, ni raisonnement) pendant idleTimeoutMs,
   * la requête est abandonnée et une erreur explicite laisse le fallback
   * reprendre. Les « : keep-alive » ne comptent pas comme progression.
   */
  async function call(
    model: string,
    opts: CompleteOptions,
    reasoning: ReasoningEffort,
    retried = false,
  ): Promise<string> {
    const maxTokens = opts.maxTokens ?? 4096;
    const effort = opts.reasoning ?? reasoning;
    const controller = new AbortController();
    let idle = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const armIdleTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        idle = true;
        controller.abort();
      }, idleTimeoutMs);
    };

    let content = '';
    let finish = 'unknown';
    let completionTokens: number | string = '?';
    armIdleTimer();
    try {
      const stream = await client.chat.completions.create(
        {
          model,
          max_tokens: maxTokens,
          stream: true,
          stream_options: { include_usage: true },
          // Paramètre Deepseek hors du typage OpenAI ('none' n'y figure pas)
          ...(effort === 'full' ? {} : ({ reasoning_effort: effort } as Record<string, unknown>)),
          messages: [
            { role: 'system' as const, content: opts.system },
            ...opts.messages.map((m) => ({ role: m.role, content: m.content })),
          ],
        },
        { signal: controller.signal },
      );
      for await (const chunk of stream) {
        const choice = chunk.choices[0];
        // reasoning_content : champ Deepseek hors du typage OpenAI
        const delta = choice?.delta as { content?: string | null; reasoning_content?: string | null } | undefined;
        if (delta?.content || delta?.reasoning_content) armIdleTimer();
        if (delta?.content) content += delta.content;
        if (choice?.finish_reason) finish = choice.finish_reason;
        if (chunk.usage) completionTokens = chunk.usage.completion_tokens;
      }
    } catch (error) {
      if (idle) {
        throw new Error(
          `Deepseek idle timeout: no output for ${idleTimeoutMs} ms (model=${model}, max_tokens=${maxTokens})`,
        );
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }

    if (content.trim()) return content;
    if (finish === 'length' && !retried && maxTokens < 64000) {
      return call(model, { ...opts, maxTokens: Math.min(maxTokens * 2, 64000) }, reasoning, true);
    }
    throw new Error(
      `Deepseek returned empty content (model=${model}, finish_reason=${finish}, ` +
        `completion_tokens=${completionTokens}, max_tokens=${maxTokens})`,
    );
  }

  return {
    name: 'deepseek',
    complete: (opts) => call(DEEPSEEK_CHAT_MODEL, opts, 'low'),
    correct: (opts) => call(DEEPSEEK_REASONER_MODEL, opts, 'full'),
  };
}

/** Fallback Anthropic (modèle défini dans CLAUDE.md : claude-sonnet-4-6). */
export function createAnthropicProvider(
  apiKey: string,
  model = process.env['ANTHROPIC_MODEL'] ?? 'claude-sonnet-4-6',
): LlmProvider {
  const client = new Anthropic({ apiKey });

  async function call(opts: CompleteOptions): Promise<string> {
    return withNetworkRetry(() => callOnce(opts));
  }

  async function callOnce(opts: CompleteOptions): Promise<string> {
    // Streaming : indispensable pour les grosses sorties (3 trips × 14 jours)
    // sans timeout HTTP — on récupère le message final complet.
    const stream = client.messages.stream({
      model,
      max_tokens: opts.maxTokens ?? 4096,
      system: opts.system,
      messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
    });
    const response = await stream.finalMessage();
    if ((response.stop_reason as string) === 'refusal') {
      throw new Error('Anthropic model refused the request');
    }
    if (response.stop_reason === 'max_tokens') {
      throw new Error(
        `Anthropic output truncated at ${opts.maxTokens ?? 4096} tokens (max_tokens reached)`,
      );
    }
    return response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');
  }

  return {
    name: 'anthropic',
    complete: call,
    correct: call,
  };
}

/**
 * Fallback RUNTIME (règle TRIPTIC : « fallback Claude si Deepseek échoue »).
 * Chaque appel tente le provider principal ; sur échec non transitoire
 * (solde épuisé 402, clé révoquée 401, 5xx…), l'appel repart sur le
 * fallback. Les retries réseau transitoires restent gérés en amont par
 * withNetworkRetry dans chaque provider.
 */
/** Prévenu à chaque bascule : le serveur journalise (coût, diagnostic). */
export type FallbackListener = (info: {
  method: 'complete' | 'correct';
  from: string;
  to: string;
  error: unknown;
}) => void;

export function createFallbackProvider(
  primary: LlmProvider,
  fallback: LlmProvider,
  onFallback?: FallbackListener,
): LlmProvider {
  const wrap =
    (method: 'complete' | 'correct') =>
    async (opts: CompleteOptions): Promise<string> => {
      try {
        return await primary[method](opts);
      } catch (error) {
        onFallback?.({ method, from: primary.name, to: fallback.name, error });
        return fallback[method](opts);
      }
    };
  return {
    name: `${primary.name}→${fallback.name}`,
    complete: wrap('complete'),
    correct: wrap('correct'),
  };
}

/**
 * Sélectionne le provider selon les clés disponibles :
 * Deepseek (principal) avec fallback runtime Anthropic si les deux clés
 * existent ; sinon celui dont la clé est configurée. Erreur claire sinon.
 */
export function createProviderFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  onFallback?: FallbackListener,
): LlmProvider {
  const deepseekKey = env['DEEPSEEK_API_KEY'];
  const anthropicKey = env['ANTHROPIC_API_KEY'];
  const hasDeepseek = Boolean(deepseekKey && !deepseekKey.startsWith('sk-xxx'));
  const hasAnthropic = Boolean(anthropicKey && !anthropicKey.startsWith('sk-ant-xxx'));
  if (hasDeepseek && hasAnthropic) {
    return createFallbackProvider(
      createDeepseekProvider(deepseekKey as string),
      createAnthropicProvider(anthropicKey as string),
      onFallback,
    );
  }
  if (hasDeepseek) return createDeepseekProvider(deepseekKey as string);
  if (hasAnthropic) return createAnthropicProvider(anthropicKey as string);
  throw new Error(
    'No AI provider configured: set DEEPSEEK_API_KEY or ANTHROPIC_API_KEY in .env',
  );
}
