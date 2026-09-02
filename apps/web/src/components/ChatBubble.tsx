import type { ChatMessage } from '@triptic/shared';

/**
 * ChatBubble — la conversation sur la planche.
 * Pas de bulles arrondies (DESIGN.md) : la demande de l'utilisateur est une
 * citation en serif italique, tenue par un filet rouille ; la réponse du
 * moteur est une note imprimée sur papier, filet encre. Les deux restent en
 * encre carbone — trail sur snow ≈ 14:1 — le contraste n'est jamais en jeu.
 */
export function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  if (isUser) {
    return (
      <blockquote className="fade-up ml-auto max-w-[85%] border-l-2 border-summit py-1 pl-4 sm:max-w-[70%]">
        <p className="font-display text-lg italic leading-snug text-trail">{message.content}</p>
      </blockquote>
    );
  }
  return (
    <div className="fade-up max-w-[85%] border border-mist bg-snow px-4 py-3 text-sm leading-relaxed text-trail sm:max-w-[70%]">
      {message.content}
    </div>
  );
}
