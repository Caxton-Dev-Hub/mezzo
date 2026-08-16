import { ChatMessage } from '../../database/entities/chat-message.entity';
import { EvidenceItemResponse } from '../../evidence/dto/evidence-response';

export interface ChatMessageResponse {
  id: string;
  escrowId: string;
  senderId: string;
  body: string;
  attachment: EvidenceItemResponse | null;
  createdAt: Date;
  hiddenAt: Date | null;
}

export interface ChatReadState {
  userId: string;
  lastReadAt: Date;
}

export function toChatMessageResponse(
  message: ChatMessage,
  attachment: EvidenceItemResponse | null,
): ChatMessageResponse {
  return {
    id: message.id,
    escrowId: message.escrowId,
    senderId: message.senderId,
    body: message.body,
    attachment,
    createdAt: message.createdAt,
    hiddenAt: message.hiddenAt,
  };
}
