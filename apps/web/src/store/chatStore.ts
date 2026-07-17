import { create } from 'zustand';
import type { ChatMessage, Lang, PlanId } from '@triptic/shared';
import { generateTripsStream, type TripsPayload } from '../lib/api';

type ChatStatus = 'idle' | 'generating' | 'validating' | 'retrying' | 'photos' | 'error';

interface ChatState {
  messages: ChatMessage[];
  status: ChatStatus;
  error: string | null;
  result: TripsPayload | null;
  send: (content: string, lang: Lang, plan: PlanId) => Promise<void>;
  /** Relance la génération avec la conversation existante (ex. après upgrade de plan). */
  regenerate: (lang: Lang, plan: PlanId) => Promise<void>;
  reset: () => void;
}

export const useChatStore = create<ChatState>((set, get) => {
  async function run(messages: ChatMessage[], lang: Lang, plan: PlanId): Promise<void> {
    set({ messages, status: 'generating', error: null, result: null });
    try {
      await generateTripsStream(messages, lang, plan, (event) => {
        switch (event.event) {
          case 'status':
            set({ status: event.data.step as ChatStatus });
            break;
          case 'question':
            set({
              messages: [...get().messages, { role: 'assistant', content: event.data.message }],
              status: 'idle',
            });
            break;
          case 'trips':
            set({ result: event.data, status: 'idle' });
            break;
          case 'error':
            set({ status: 'error', error: event.data.error });
            break;
        }
      });
      if (get().status !== 'idle' && get().status !== 'error') {
        set({ status: 'idle' });
      }
    } catch {
      set({ status: 'error', error: 'generation_failed' });
    }
  }

  return {
    messages: [],
    status: 'idle',
    error: null,
    result: null,

    reset: () => set({ messages: [], status: 'idle', error: null, result: null }),

    send: async (content, lang, plan) => {
      await run([...get().messages, { role: 'user', content }], lang, plan);
    },

    regenerate: async (lang, plan) => {
      const { messages, status } = get();
      if (messages.length === 0 || status !== 'idle') return;
      await run(messages, lang, plan);
    },
  };
});
