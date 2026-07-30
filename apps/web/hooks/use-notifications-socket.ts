import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { NotificationResponse, SocketRejection } from '@mezzo/shared-types';
import { useAuthStore } from '../lib/auth-store';
import { ensureFreshSession } from '../lib/auth-client';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
const MAX_REAUTH_ATTEMPTS = 3;
const STABLE_CONNECTION_MS = 3_000;

export function useNotificationsSocket(
  onNotification: (notification: NotificationResponse) => void,
): void {
  const userId = useAuthStore((state) => state.user?.id);
  const [reconnectNonce, setReconnectNonce] = useState(0);
  const callbackRef = useRef(onNotification);
  callbackRef.current = onNotification;
  const reauthAttemptsRef = useRef(0);

  useEffect(() => {
    if (!userId || !useAuthStore.getState().accessToken) {
      return;
    }

    const socket: Socket = io(`${API_URL}/ws/notifications`, {
      auth: { token: useAuthStore.getState().accessToken },
      transports: ['websocket'],
    });

    let stableTimer: ReturnType<typeof setTimeout> | undefined;

    socket.on('connect', () => {
      stableTimer = setTimeout(() => {
        reauthAttemptsRef.current = 0;
      }, STABLE_CONNECTION_MS);
    });

    socket.on('disconnect', () => clearTimeout(stableTimer));

    socket.io.on('reconnect_attempt', () => {
      socket.auth = { token: useAuthStore.getState().accessToken };
    });

    socket.on('notification:new', (notification: NotificationResponse) => {
      callbackRef.current(notification);
    });

    socket.on('connect_error', (error) => {
      const rejection = (error as { data?: SocketRejection }).data;
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

    return () => {
      clearTimeout(stableTimer);
      socket.close();
    };
  }, [userId, reconnectNonce]);
}
