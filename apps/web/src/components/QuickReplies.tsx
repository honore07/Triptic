import { useTranslation } from 'react-i18next';

/**
 * Chips de réponse rapide sous la question du moteur IA. Les libellés viennent
 * du LLM (déjà dans la langue de l'utilisateur — pas d'i18n sur eux). Un tap
 * envoie le texte comme message utilisateur (même chemin que la saisie).
 */
export function QuickReplies({
  replies,
  disabled,
  onPick,
}: {
  replies: string[];
  disabled: boolean;
  onPick: (reply: string) => void;
}) {
  const { t } = useTranslation();
  if (replies.length === 0) return null;
  return (
    <div
      role="group"
      aria-label={t('chat.quick_replies')}
      className="fade-up flex flex-wrap gap-2 pl-1"
    >
      {replies.map((reply) => (
        <button
          key={reply}
          type="button"
          disabled={disabled}
          onClick={() => onPick(reply)}
          className="min-h-11 rounded-full border border-mist bg-terrain px-4 py-2 text-sm font-medium text-trail transition-colors duration-200 hover:border-gold-deep hover:bg-gold disabled:opacity-60"
        >
          {reply}
        </button>
      ))}
    </div>
  );
}
