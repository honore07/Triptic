import type { ChatMessage } from '@triptic/shared';

export function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? 'rounded-br-sm bg-summit text-snow'
            : 'rounded-bl-sm bg-snow text-trail shadow-sm'
        }`}
      >
        {message.content}
      </div>
    </div>
  );
}

export function TypingBubble({ label }: { label: string }) {
  return (
    <div className="flex justify-start" role="status" aria-label={label}>
      <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm bg-snow px-4 py-3 shadow-sm">
        <span className="flex gap-1">
          <span className="typing-dot h-1.5 w-1.5 rounded-full bg-ridge" />
          <span className="typing-dot h-1.5 w-1.5 rounded-full bg-ridge" />
          <span className="typing-dot h-1.5 w-1.5 rounded-full bg-ridge" />
        </span>
        <span className="text-xs text-ridge">{label}</span>
      </div>
    </div>
  );
}
