import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { NotificationResponse } from '@mezzo/shared-types';
import { useAuthStore } from '../lib/auth-store';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export function useNotificationsSocket(onNotification: (notification: NotificationResponse) => void): void {
  const accessToken = useAuthStore((state) => state.accessToken);
  const callbackRef = useRef(onNotification);
  callbackRef.current = onNotification;

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    const socket: Socket = io(`${API_URL}/ws/notifications`, {
      auth: { token: accessToken },
      transports: ['websocket'],
    });

    socket.on('notification:new', (notification: NotificationResponse) => {
      callbackRef.current(notification);
    });

    return () => {
      socket.close();
    };
  }, [accessToken]);
}
