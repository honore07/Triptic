import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MessageSquare, Send } from 'lucide-react';
import type { Lang, PlanId, TripProposal } from '@triptic/shared';
import { ApiError, editTripStream, type RecomputePayload } from '../lib/api';

/**
 * Édition conversationnelle (roadmap 3.2) : « change le J3 matin en trail
 * 20 km très sportive ». L'IA modifie l'activité ciblée, le correcteur
 * valide, le serveur recalcule — le résultat est mergé dans le trip.
 */

interface Props {
  trip: TripProposal;
  lang: Lang;
  plan: PlanId;
  onBeforeApply: () => void;
  onApply: (payload: RecomputePayload) => void;
}

export function TripEditChat({ trip, lang, plan, onBeforeApply, onApply }: Props) {
  const { t } = useTranslation();
  const [instruction, setInstruction] = useState('');
  const [status, setStatus] = useState<'idle' | 'busy' | 'error' | 'auth_required'>('idle');
  const [step, setStep] = useState<string | null>(null);
  const [question, setQuestion] = useState<string | null>(null);

  const submit = async () => {
    const text = instruction.trim();
    if (!text || status === 'busy' || !trip.days?.length) return;
    setStatus('busy');
    setQuestion(null);
    try {
      await editTripStream(trip, text, lang, plan, (event) => {
        switch (event.event) {
          case 'status':
            setStep(event.data.step);
            break;
          case 'question':
            setQuestion(event.data.message);
            break;
          case 'trip':
            onBeforeApply();
            onApply(event.data);
            setInstruction('');
            break;
          case 'error':
            setStatus('error');
            break;
        }
      });
      setStatus((s) => (s === 'error' ? 'error' : 'idle'));
    } catch (err) {
      // 401 = compte requis (l'édition IA consomme du LLM) → proposer la connexion
      setStatus(err instanceof ApiError && err.status === 401 ? 'auth_required' : 'error');
    }
    setStep(null);
  };

  return (
    <section aria-labelledby="edit-chat-title" className="flex flex-col gap-2">
      <h2
        id="edit-chat-title"
        className="flex items-center gap-2 font-display text-xl font-bold text-trail"
      >
        <MessageSquare size={18} className="text-summit" aria-hidden="true" />
        {t('edit_chat.title')}
      </h2>
      {question && (
        <p className="border border-mist bg-terrain px-4 py-3 font-display text-base italic text-trail">{question}</p>
      )}
      {status === 'error' && (
        <p role="alert" className="border border-storm-deep bg-storm-tint px-4 py-3 text-sm text-storm-deep">
          {t('edit_chat.error')}
        </p>
      )}
      {status === 'auth_required' && (
        <p role="alert" className="border border-mist bg-terrain px-4 py-3 text-sm text-ridge">
          {t('auth.required_generation')}{' '}
          <Link to="/login" className="font-semibold text-copper-deep underline">
            {t('auth.login_nav')}
          </Link>
        </p>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <input
          type="text"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder={t('edit_chat.placeholder')}
          aria-label={t('edit_chat.placeholder')}
          disabled={status === 'busy'}
          className="min-h-12 flex-1 border border-mist bg-snow px-4 font-display text-base italic text-trail shadow-[3px_3px_0_rgba(34,34,34,0.5)] placeholder:text-fog disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={status === 'busy' || !instruction.trim()}
          aria-label={t('chat.send')}
          className="cta-plate flex min-h-12 min-w-12 items-center justify-center disabled:bg-mist disabled:text-fog"
        >
          <Send size={18} aria-hidden="true" />
        </button>
      </form>
      {status === 'busy' && (
        <p className="text-xs text-fog" aria-live="polite">
          {step ? t(`chat.status_${step}`, t('chat.thinking')) : t('chat.thinking')}
        </p>
      )}
    </section>
  );
}
