import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import type { ChatMessage } from '@triptic/shared';

export interface CompleteOptions {
  system: string;
  messages: ChatMessage[];
  maxTokens?: number;
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

export function createDeepseekProvider(apiKey: string): LlmProvider {
  const client = new OpenAI({ baseURL: DEEPSEEK_BASE_URL, apiKey });

  async function call(model: string, opts: CompleteOptions): Promise<string> {
    const response = await client.chat.completions.create({
      model,
      max_tokens: opts.maxTokens ?? 4096,
      messages: [
        { role: 'system' as const, content: opts.system },
        ...opts.messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    });
    return response.choices[0]?.message?.content ?? '';
  }

  return {
    name: 'deepseek',
    complete: (opts) => call('deepseek-chat', opts),
    correct: (opts) => call('deepseek-reasoner', opts),
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
 * Sélectionne le provider selon les clés disponibles :
 * Deepseek (principal) → Anthropic (fallback). Erreur claire si aucune clé.
 */
export function createProviderFromEnv(env: NodeJS.ProcessEnv = process.env): LlmProvider {
  const deepseekKey = env['DEEPSEEK_API_KEY'];
  if (deepseekKey && !deepseekKey.startsWith('sk-xxx')) {
    return createDeepseekProvider(deepseekKey);
  }
  const anthropicKey = env['ANTHROPIC_API_KEY'];
  if (anthropicKey && !anthropicKey.startsWith('sk-ant-xxx')) {
    return createAnthropicProvider(anthropicKey);
  }
  throw new Error(
    'No AI provider configured: set DEEPSEEK_API_KEY or ANTHROPIC_API_KEY in .env',
  );
}
