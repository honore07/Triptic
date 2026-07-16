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
    const response = await client.messages.create({
      model,
      max_tokens: opts.maxTokens ?? 4096,
      system: opts.system,
      messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
    });
    if ((response.stop_reason as string) === 'refusal') {
      throw new Error('Anthropic model refused the request');
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
