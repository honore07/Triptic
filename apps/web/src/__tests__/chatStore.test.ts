import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateTripsStream } from '../lib/api';
import { useChatStore } from '../store/chatStore';

vi.mock('../lib/api', () => ({
  generateTripsStream: vi.fn(async () => {}),
}));

const mockStream = vi.mocked(generateTripsStream);

/** Simule un serveur qui répond par une question (avec ou sans chips). */
function streamQuestion(message: string, quickReplies?: string[]) {
  mockStream.mockImplementation(async (_messages, _lang, _plan, onEvent) => {
    onEvent({
      event: 'question',
      data: { message, ...(quickReplies ? { quick_replies: quickReplies } : {}) },
    });
  });
}

beforeEach(() => {
  useChatStore.getState().reset();
  mockStream.mockReset();
  mockStream.mockImplementation(async () => {});
});

describe('chatStore — quick replies', () => {
  it('stocke les chips de la dernière question du moteur', async () => {
    streamQuestion('Vous partez à combien ?', ['Solo', 'En couple', 'En famille']);
    await useChatStore.getState().send('un trip chill', 'fr', 'free');
    const state = useChatStore.getState();
    expect(state.quickReplies).toEqual(['Solo', 'En couple', 'En famille']);
    expect(state.messages.at(-1)).toEqual({
      role: 'assistant',
      content: 'Vous partez à combien ?',
    });
    expect(state.status).toBe('idle');
  });

  it('efface les chips dès que l’utilisateur renvoie un message', async () => {
    streamQuestion('Quel budget ?', ['Petit budget', 'Confort']);
    await useChatStore.getState().send('un trip', 'fr', 'free');
    expect(useChatStore.getState().quickReplies).toEqual(['Petit budget', 'Confort']);

    // Réponse (tapée ou via chip) : le serveur ne repose pas de question
    mockStream.mockImplementation(async () => {});
    await useChatStore.getState().send('Petit budget', 'fr', 'free');
    expect(useChatStore.getState().quickReplies).toEqual([]);
    expect(useChatStore.getState().messages.at(-1)).toEqual({
      role: 'user',
      content: 'Petit budget',
    });
  });

  it('question sans quick_replies → aucune chip', async () => {
    streamQuestion('Où veux-tu aller ?');
    await useChatStore.getState().send('un trip', 'fr', 'free');
    expect(useChatStore.getState().quickReplies).toEqual([]);
  });

  it('reset efface aussi les chips', async () => {
    streamQuestion('Quel budget ?', ['Petit budget']);
    await useChatStore.getState().send('un trip', 'fr', 'free');
    useChatStore.getState().reset();
    expect(useChatStore.getState().quickReplies).toEqual([]);
  });
});
