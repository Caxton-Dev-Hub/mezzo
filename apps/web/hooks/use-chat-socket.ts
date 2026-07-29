import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { ChatMessageResponse, ChatReadState, EscrowUpdatedEvent } from '@mezzo/shared-types';
import { useAuthStore } from '../lib/auth-store';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export type ChatSocketStatus = 'connecting' | 'connected' | 'disconnected';

interface UseChatSocketOptions {
  onMessage?: (message: ChatMessageResponse) => void;
  onRead?: (readState: ChatReadState) => void;
  onEscrowUpdated?: (event: EscrowUpdatedEvent) => void;
}

export function useChatSocket(escrowId: string, options: UseChatSocketOptions = {}) {
  const accessToken = useAuthStore((state) => state.accessToken);
  const [status, setStatus] = useState<ChatSocketStatus>('connecting');
  const socketRef = useRef<Socket | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    setStatus('connecting');
    const socket = io(`${API_URL}/ws/chat`, {
      auth: { token: accessToken, escrowId },
      transports: ['websocket'],
    });
    socketRef.current = socket;

    socket.on('connect', () => setStatus('connected'));
    socket.on('disconnect', () => setStatus('disconnected'));
    socket.on('message:new', (message: ChatMessageResponse) => optionsRef.current.onMessage?.(message));
    socket.on('message:read', (readState: ChatReadState) => optionsRef.current.onRead?.(readState));
    socket.on('escrow:updated', (event: EscrowUpdatedEvent) => optionsRef.current.onEscrowUpdated?.(event));

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [accessToken, escrowId]);

  function sendMessage(body: string, attachmentEvidenceItemId?: string): void {
    socketRef.current?.emit('message:send', { body, attachmentEvidenceItemId });
  }

  function markRead(): void {
    socketRef.current?.emit('message:read');
  }

  return { status, sendMessage, markRead };
}
