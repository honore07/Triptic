import { create } from 'zustand';
import type { ChatMessage, Lang, PlanId, TripRequest, TripTuning } from '@triptic/shared';
import { generateTripsStream, type TripsPayload } from '../lib/api';

type ChatStatus =
  | 'idle'
  | 'generating'
  | 'grounding'
  | 'validating'
  | 'retrying'
  | 'routing'
  | 'photos'
  | 'error';

interface ChatState {
  messages: ChatMessage[];
  status: ChatStatus;
  error: string | null;
  result: TripsPayload | null;
  /** Curseurs 1-5 confirmés par l'utilisateur (null = TripTuner pas encore validé). */
  tuning: TripTuning | null;
  /**
   * Onboarding hybride (1.1) : corrections des paramètres détectés, liées aux
   * enums TripRequest (jamais du texte re-parsé). Cumulées entre régénérations.
   */
  overrides: Partial<TripRequest>;
  /** Applique une correction de puce et régénère avec les valeurs confirmées. */
  applyOverrides: (patch: Partial<TripRequest>, lang: Lang, plan: PlanId) => Promise<void>;
  /** Pose la demande initiale SANS générer — le TripTuner s'affiche ensuite. */
  begin: (content: string) => void;
  /** Valide les curseurs et lance la génération hyper-personnalisée. */
  confirmTuning: (tuning: TripTuning, lang: Lang, plan: PlanId) => Promise<void>;
  send: (content: string, lang: Lang, plan: PlanId) => Promise<void>;
  /** Relance la génération avec la conversation existante (ex. après upgrade de plan). */
  regenerate: (lang: Lang, plan: PlanId) => Promise<void>;
  reset: () => void;
}

export const useChatStore = create<ChatState>((set, get) => {
  async function run(messages: ChatMessage[], lang: Lang, plan: PlanId): Promise<void> {
    set({ messages, status: 'generating', error: null, result: null });
    try {
      await generateTripsStream(
        messages,
        lang,
        plan,
        (event) => {
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
        },
        get().tuning,
        get().overrides,
      );
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
    tuning: null,
    overrides: {},

    reset: () =>
      set({
        messages: [],
        status: 'idle',
        error: null,
        result: null,
        tuning: null,
        overrides: {},
      }),

    applyOverrides: async (patch, lang, plan) => {
      if (get().status !== 'idle' || get().messages.length === 0) return;
      set({ overrides: { ...get().overrides, ...patch } });
      await run(get().messages, lang, plan);
    },

    begin: (content) => {
      if (get().messages.length > 0) return;
      set({ messages: [{ role: 'user', content }], status: 'idle', error: null, result: null });
    },

    confirmTuning: async (tuning, lang, plan) => {
      set({ tuning });
      await run(get().messages, lang, plan);
    },

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
