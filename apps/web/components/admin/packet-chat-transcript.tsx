import type { ChatMessageResponse } from '@mezzo/shared-types';
import { Paperclip } from 'lucide-react';
import { formatDateTime } from '../../lib/format-date';

interface PacketChatTranscriptProps {
  messages: ChatMessageResponse[];
  buyerId: string | null;
  canModerate?: boolean;
  onHide?: (messageId: string) => void;
}

export function PacketChatTranscript({
  messages,
  buyerId,
  canModerate = false,
  onHide,
}: PacketChatTranscriptProps) {
  if (messages.length === 0) {
    return <p className="text-[13px] text-mute">The parties never used the in-app chat.</p>;
  }

  return (
    <ol className="space-y-3">
      {messages.map((message) => (
        <li key={message.id} className="border-l border-line pl-3">
          <p className="text-[12px] text-mute">
            <span className="font-mono uppercase tracking-wide">
              {message.senderId === buyerId ? 'Buyer' : 'Seller'}
            </span>{' '}
            · {formatDateTime(message.createdAt)}
            {message.hiddenAt ? (
              <span className="ml-2 rounded-full bg-danger/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-danger">
                Hidden
              </span>
            ) : null}
          </p>
          {message.body ? (
            <p className={message.hiddenAt ? 'mt-1 text-[13px] text-mute line-through' : 'mt-1 text-[13px] text-vellum'}>
              {message.body}
            </p>
          ) : null}
          {message.attachment ? (
            <a
              href={`#evidence-${message.attachment.id}`}
              className="mt-1 inline-flex items-center gap-1.5 font-mono text-[11px] text-fog hover:text-vellum"
            >
              <Paperclip className="h-3 w-3" />
              {message.attachment.id}
            </a>
          ) : null}
          {canModerate && !message.hiddenAt && onHide ? (
            <button
              type="button"
              className="mt-1 block text-[11px] text-danger hover:underline"
              onClick={() => onHide(message.id)}
            >
              Hide message
            </button>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
