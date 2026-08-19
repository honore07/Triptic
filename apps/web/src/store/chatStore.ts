import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { tripDurationDays } from '@triptic/shared';
import type { ChatMessage, Lang, PlanId, TripRequest, TripTuning } from '@triptic/shared';
import { ApiError, generateTripsStream, type TripsPayload } from '../lib/api';

/** Dates du trip choisies dans l'onboarding (ISO yyyy-mm-dd). */
export interface TripDates {
  start: string;
  end: string;
}

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
  /**
   * Chips de réponse rapide de la DERNIÈRE question du moteur (déjà dans la
   * langue de l'utilisateur). Effacées dès qu'un nouveau message part.
   */
  quickReplies: string[];
  /** Curseurs 1-5 confirmés par l'utilisateur (null = TripTuner pas encore validé). */
  tuning: TripTuning | null;
  /**
   * Onboarding hybride (1.1) : corrections des paramètres détectés, liées aux
   * enums TripRequest (jamais du texte re-parsé). Cumulées entre régénérations.
   */
  overrides: Partial<TripRequest>;
  /** Dates départ/retour (fixent saison, durée exacte et fenêtre météo). */
  dates: TripDates | null;
  /** Applique une correction de puce et régénère avec les valeurs confirmées. */
  applyOverrides: (patch: Partial<TripRequest>, lang: Lang, plan: PlanId) => Promise<void>;
  /** Pose la demande initiale SANS générer — le TripTuner s'affiche ensuite. */
  begin: (content: string) => void;
  /** Valide curseurs + dates éventuelles et lance la génération. */
  confirmTuning: (
    tuning: TripTuning,
    lang: Lang,
    plan: PlanId,
    dates?: TripDates | null,
    /** Départ/arrivée saisis explicitement (boucle = arrivée == départ). */
    places?: Partial<TripRequest>,
  ) => Promise<void>;
  send: (content: string, lang: Lang, plan: PlanId) => Promise<void>;
  /** Relance la génération avec la conversation existante (ex. après upgrade de plan). */
  regenerate: (lang: Lang, plan: PlanId) => Promise<void>;
  reset: () => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => {
  async function run(messages: ChatMessage[], lang: Lang, plan: PlanId): Promise<void> {
    set({ messages, status: 'generating', error: null, result: null, quickReplies: [] });
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
                quickReplies: event.data.quick_replies ?? [],
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
        get().dates?.start ?? null,
      );
      if (get().status !== 'idle' && get().status !== 'error') {
        set({ status: 'idle' });
      }
    } catch (err) {
      // 401 = compte requis (Supabase configuré) → l'UI propose la connexion
      const authRequired = err instanceof ApiError && err.status === 401;
      set({ status: 'error', error: authRequired ? 'auth_required' : 'generation_failed' });
    }
  }

  return {
    messages: [],
    status: 'idle',
    error: null,
    result: null,
    quickReplies: [],
    tuning: null,
    overrides: {},
    dates: null,

    reset: () =>
      set({
        messages: [],
        status: 'idle',
        error: null,
        result: null,
        quickReplies: [],
        tuning: null,
        overrides: {},
        dates: null,
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

    confirmTuning: async (tuning, lang, plan, dates = null, places = {}) => {
      // Les dates fixent la durée EXACTE via l'override d'enum (jamais re-déduite)
      const duration = dates ? tripDurationDays(dates.start, dates.end) : null;
      set({
        tuning,
        dates,
        overrides: {
          ...get().overrides,
          ...places,
          ...(duration !== null ? { duration_days: duration, start_date: dates!.start } : {}),
        },
      });
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
    },
    {
      // Un refresh (ou une coupure pendant la génération, 10-30 s) ne doit
      // plus coûter la conversation ni les trips générés — le quota, lui,
      // est déjà consommé côté serveur. Les états transitoires (status,
      // quickReplies) ne sont pas persistés : retour à idle au chargement.
      name: 'triptic-chat',
      storage: createJSONStorage(() => localStorage),
      // tuning est volontairement NON persisté : restauré avec des messages
      // mais sans result (refresh en pleine génération), il masquait le
      // TripTuner et laissait la page sans aucun bouton d'action.
      partialize: (s) => ({
        messages: s.messages,
        result: s.result,
        overrides: s.overrides,
        dates: s.dates,
      }),
    },
  ),
);
