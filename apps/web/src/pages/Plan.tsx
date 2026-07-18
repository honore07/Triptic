import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Send } from 'lucide-react';
import { PLANS, type Lang, type TripProposal } from '@triptic/shared';
import { ChatBubble, TypingBubble } from '../components/ChatBubble';
import { TripCompare } from '../components/TripCompare';
import { TripTuner } from '../components/TripTuner';
import { useChatStore } from '../store/chatStore';
import { useTripStore } from '../store/tripStore';
import { useUserStore } from '../store/userStore';

export function Plan() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { initialQuery?: string } };
  const { messages, status, error, result, tuning, begin, confirmTuning, send, regenerate } =
    useChatStore();
  const { plan, openPaywall, setRemaining } = useUserStore();
  const selectTrip = useTripStore((s) => s.select);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

  const lang = (i18n.language as Lang) ?? 'fr';
  const busy = status !== 'idle' && status !== 'error';
  // Le TripTuner s'affiche après la demande initiale, avant la 1re génération
  const tunerVisible = messages.length > 0 && !tuning && !result && !busy;

  useEffect(() => {
    const initial = location.state?.initialQuery;
    if (initial && !startedRef.current && messages.length === 0) {
      startedRef.current = true;
      begin(initial);
    }
  }, [location.state, messages.length, begin]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, status, result, tuning]);

  useEffect(() => {
    if (result && result.remaining !== null) setRemaining(result.remaining);
  }, [result, setRemaining]);

  // Après un upgrade de plan (paywall), relance automatiquement la même
  // demande : le résultat affiché ne contenait qu'1 trip, le serveur peut
  // maintenant renvoyer les 3.
  useEffect(() => {
    if (
      result &&
      result.locked_proposals > 0 &&
      PLANS[plan].limits.trip_proposals > result.generation.trips.length
    ) {
      void regenerate(lang, plan);
    }
  }, [plan, result, regenerate, lang]);

  const submit = () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    // La toute première demande passe par le TripTuner ; les suivantes
    // (réponses aux questions du moteur) génèrent directement.
    if (messages.length === 0) {
      begin(text);
    } else {
      void send(text, lang, plan);
    }
  };

  const onChoose = (trip: TripProposal) => {
    selectTrip(trip);
    navigate('/trip');
  };

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6">
      <h1 className="fade-up font-display text-2xl font-bold text-trail">{t('chat.title')}</h1>

      <section aria-label={t('chat.title')} className="flex flex-col gap-3">
        {messages.map((message, i) => (
          <ChatBubble key={i} message={message} />
        ))}
        {busy && <TypingBubble label={t(`chat.status_${status}`, t('chat.thinking'))} />}
        {status === 'error' && (
          <p role="alert" className="fade-up rounded-xl bg-storm/10 px-4 py-3 text-sm text-storm">
            {error === 'quota_exceeded' ? t('chat.error_quota') : t('chat.error_generation')}
            {error === 'quota_exceeded' && (
              <button
                type="button"
                onClick={openPaywall}
                className="ml-2 font-semibold underline"
              >
                {t('trips.locked_cta')}
              </button>
            )}
          </p>
        )}
        <div ref={bottomRef} />
      </section>

      {tunerVisible && <TripTuner onConfirm={(value) => void confirmTuning(value, lang, plan)} />}

      {!result && !tunerVisible && (
        <form
          className="sticky bottom-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={messages.length === 0 ? t('home.placeholder') : t('chat.placeholder')}
            aria-label={t('chat.placeholder')}
            disabled={busy}
            className="min-h-12 flex-1 rounded-xl border border-mist bg-snow px-4 text-sm text-trail shadow-sm placeholder:text-fog disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            aria-label={t('chat.send')}
            className="flex min-h-12 min-w-12 items-center justify-center rounded-xl bg-gold text-trail transition-all duration-200 hover:-translate-y-0.5 hover:bg-gold-deep disabled:translate-y-0 disabled:bg-mist disabled:text-fog"
          >
            <Send size={18} aria-hidden="true" />
          </button>
        </form>
      )}

      {result && (
        <TripCompare
          trips={result.generation.trips}
          lockedCount={result.locked_proposals}
          differentiator={result.generation.differentiator}
          onChoose={onChoose}
          onUnlock={openPaywall}
        />
      )}
    </main>
  );
}
