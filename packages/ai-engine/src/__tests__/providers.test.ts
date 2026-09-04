import { describe, expect, it, vi } from 'vitest';

/**
 * Deepseek v4 raisonne avant de répondre : quand le budget de tokens est
 * mangé par la réflexion, l'API renvoie un contenu vide avec
 * finish_reason « length ». Ce vide ne doit JAMAIS atteindre le parseur JSON
 * (« No JSON object found », vu en prod le 03/09/2026) : une retentative
 * avec le double, puis une erreur franche qui laisse le fallback reprendre.
 */
const create = vi.fn();
vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: (...a: unknown[]) => create(...a) } };
  },
}));
vi.mock('@anthropic-ai/sdk', () => ({ default: class {} }));

const reply = (content: string | null, finish_reason: string, completion_tokens = 10) => ({
  choices: [{ message: { content }, finish_reason }],
  usage: { completion_tokens },
});

describe('createDeepseekProvider', () => {
  it('renvoie le contenu quand il y en a', async () => {
    const { createDeepseekProvider } = await import('../providers');
    create.mockReset().mockResolvedValueOnce(reply('{"ok":true}', 'stop'));
    const p = createDeepseekProvider('sk-test');
    await expect(p.complete({ system: 's', messages: [], maxTokens: 300 })).resolves.toBe('{"ok":true}');
  });

  it('budget épuisé et contenu vide : retente une fois avec le double, puis échoue franchement', async () => {
    const { createDeepseekProvider } = await import('../providers');
    create
      .mockReset()
      .mockResolvedValueOnce(reply('', 'length', 4000))
      .mockResolvedValueOnce(reply(null, 'length', 8000));
    const p = createDeepseekProvider('sk-test');
    await expect(p.complete({ system: 's', messages: [], maxTokens: 4000 })).rejects.toThrow(
      /empty content.*finish_reason=length.*max_tokens=8000/,
    );
    expect(create).toHaveBeenCalledTimes(2);
    expect((create.mock.calls[1]![0] as { max_tokens: number }).max_tokens).toBe(8000);
  });

  it('la retentative qui aboutit rend son contenu', async () => {
    const { createDeepseekProvider } = await import('../providers');
    create
      .mockReset()
      .mockResolvedValueOnce(reply('', 'length'))
      .mockResolvedValueOnce(reply('{"ok":1}', 'stop'));
    const p = createDeepseekProvider('sk-test');
    await expect(p.complete({ system: 's', messages: [], maxTokens: 1000 })).resolves.toBe('{"ok":1}');
  });

  it('contenu vide sans budget épuisé : erreur immédiate — le fallback reprend', async () => {
    const { createDeepseekProvider, createFallbackProvider } = await import('../providers');
    create.mockReset().mockResolvedValueOnce(reply('', 'stop'));
    const primary = createDeepseekProvider('sk-test');
    const fallback = {
      name: 'anthropic',
      complete: vi.fn(async () => '{"from":"fallback"}'),
      correct: vi.fn(async () => '{}'),
    };
    const p = createFallbackProvider(primary, fallback);
    await expect(p.complete({ system: 's', messages: [] })).resolves.toBe('{"from":"fallback"}');
    expect(create).toHaveBeenCalledTimes(1);
    expect(fallback.complete).toHaveBeenCalledTimes(1);
  });
});
