import type { ChatMessageResponse } from '@mezzo/shared-types';
import { Paperclip } from 'lucide-react';
import { formatDateTime } from '../../lib/format-date';

interface PacketChatTranscriptProps {
  messages: ChatMessageResponse[];
  buyerId: string | null;
}

export function PacketChatTranscript({ messages, buyerId }: PacketChatTranscriptProps) {
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
          </p>
          {message.body ? <p className="mt-1 text-[13px] text-vellum">{message.body}</p> : null}
          {message.attachment ? (
            <a
              href={`#evidence-${message.attachment.id}`}
              className="mt-1 inline-flex items-center gap-1.5 font-mono text-[11px] text-fog hover:text-vellum"
            >
              <Paperclip className="h-3 w-3" />
              {message.attachment.id}
            </a>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
