import type { ChatMessage } from '@triptic/shared';

export function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  return (
    <div className={`fade-up flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? 'rounded-br-sm bg-trail text-snow'
            : 'rounded-bl-sm bg-snow text-trail shadow-sm'
        }`}
      >
        {message.content}
      </div>
    </div>
  );
}
