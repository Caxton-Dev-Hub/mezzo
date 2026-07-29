import type { ChatMessageResponse, ChatReadState, SendMessageDto } from '@mezzo/shared-types';
import { apiRequest } from './api-client';

export function getChatMessages(escrowId: string): Promise<ChatMessageResponse[]> {
  return apiRequest<ChatMessageResponse[]>(`/escrows/${escrowId}/chat`);
}

export function sendChatMessage(escrowId: string, dto: SendMessageDto): Promise<ChatMessageResponse> {
  return apiRequest<ChatMessageResponse>(`/escrows/${escrowId}/chat`, { method: 'POST', body: dto });
}

export function getChatReadState(escrowId: string): Promise<ChatReadState[]> {
  return apiRequest<ChatReadState[]>(`/escrows/${escrowId}/chat/read`);
}

export function markChatRead(escrowId: string): Promise<ChatReadState> {
  return apiRequest<ChatReadState>(`/escrows/${escrowId}/chat/read`, { method: 'POST' });
}
