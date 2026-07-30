import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  ChatMessageResponse,
  ChatReadState,
  EscrowUpdatedEvent,
  SocketRejection,
} from '@mezzo/shared-types';
import { useAuthStore } from '../lib/auth-store';
import { ensureFreshSession } from '../lib/auth-client';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
const MAX_REAUTH_ATTEMPTS = 3;
const STABLE_CONNECTION_MS = 3_000;

export type ChatSocketStatus = 'connecting' | 'connected' | 'disconnected' | 'forbidden';

interface UseChatSocketOptions {
  onMessage?: (message: ChatMessageResponse) => void;
  onRead?: (readState: ChatReadState) => void;
  onEscrowUpdated?: (event: EscrowUpdatedEvent) => void;
}

export function useChatSocket(escrowId: string, options: UseChatSocketOptions = {}) {
  const userId = useAuthStore((state) => state.user?.id);
  const [status, setStatus] = useState<ChatSocketStatus>('connecting');
  const [reconnectNonce, setReconnectNonce] = useState(0);
  const socketRef = useRef<Socket | null>(null);
  const reauthAttemptsRef = useRef(0);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (!userId || !useAuthStore.getState().accessToken) {
      return;
    }

    setStatus('connecting');
    const socket = io(`${API_URL}/ws/chat`, {
      auth: { token: useAuthStore.getState().accessToken, escrowId },
      transports: ['websocket'],
    });
    socketRef.current = socket;

    let stableTimer: ReturnType<typeof setTimeout> | undefined;

    socket.on('connect', () => {
      setStatus('connected');
      stableTimer = setTimeout(() => {
        reauthAttemptsRef.current = 0;
      }, STABLE_CONNECTION_MS);
    });

    socket.on('disconnect', () => {
      clearTimeout(stableTimer);
      setStatus((current) => (current === 'forbidden' ? current : 'disconnected'));
    });

    socket.io.on('reconnect_attempt', () => {
      socket.auth = { token: useAuthStore.getState().accessToken, escrowId };
    });

    socket.on('connect_error', (error) => {
      const rejection = (error as { data?: SocketRejection }).data;
      if (rejection?.code === 'FORBIDDEN') {
        setStatus('forbidden');
        return;
      }
      if (rejection?.code !== 'UNAUTHORIZED' || reauthAttemptsRef.current >= MAX_REAUTH_ATTEMPTS) {
        return;
      }
      reauthAttemptsRef.current += 1;
      void ensureFreshSession().then((token) => {
        if (token) {
          setReconnectNonce((current) => current + 1);
        }
      });
    });

    socket.on('message:new', (message: ChatMessageResponse) =>
      optionsRef.current.onMessage?.(message),
    );
    socket.on('message:read', (readState: ChatReadState) => optionsRef.current.onRead?.(readState));
    socket.on('escrow:updated', (event: EscrowUpdatedEvent) =>
      optionsRef.current.onEscrowUpdated?.(event),
    );

    return () => {
      clearTimeout(stableTimer);
      socket.close();
      socketRef.current = null;
    };
  }, [userId, escrowId, reconnectNonce]);

  const sendMessage = useCallback((body: string, attachmentEvidenceItemId?: string): void => {
    socketRef.current?.emit('message:send', { body, attachmentEvidenceItemId });
  }, []);

  const markRead = useCallback((): void => {
    socketRef.current?.emit('message:read');
  }, []);

  return { status, sendMessage, markRead };
}
