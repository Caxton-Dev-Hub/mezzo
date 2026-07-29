'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import type { NotificationResponse } from '@mezzo/shared-types';
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../../lib/notifications-client';
import { useNotificationsSocket } from '../../hooks/use-notifications-socket';
import { NOTIFICATION_EVENT_LABELS } from '../../lib/notification-copy';
import { useAuthStore } from '../../lib/auth-store';

export function NotificationCenter() {
  const sessionStatus = useAuthStore((state) => state.status);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const notificationsQuery = useQuery({
    queryKey: ['notifications'],
    queryFn: getNotifications,
    enabled: sessionStatus === 'authenticated',
  });

  useNotificationsSocket((notification) => {
    queryClient.setQueryData<NotificationResponse[]>(['notifications'], (current) => {
      if (current?.some((item) => item.id === notification.id)) {
        return current;
      }
      return [notification, ...(current ?? [])];
    });
  });

  if (sessionStatus !== 'authenticated') {
    return null;
  }

  const notifications = notificationsQuery.data ?? [];
  const unreadCount = notifications.filter((notification) => !notification.isRead).length;

  async function handleOpen(): Promise<void> {
    setOpen((current) => !current);
    if (!open && unreadCount > 0) {
      await markAllNotificationsRead();
      queryClient.setQueryData<NotificationResponse[]>(['notifications'], (current) =>
        current?.map((item) => ({ ...item, isRead: true, readAt: new Date() })),
      );
    }
  }

  async function handleMarkOne(id: string): Promise<void> {
    await markNotificationRead(id);
    queryClient.setQueryData<NotificationResponse[]>(['notifications'], (current) =>
      current?.map((item) => (item.id === id ? { ...item, isRead: true, readAt: new Date() } : item)),
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => void handleOpen()}
        aria-label="Notifications"
        className="relative rounded-full p-2 text-fog hover:text-vellum"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-danger text-[10px] text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 z-40 mt-2 w-80 rounded-xl border border-line-soft bg-surface p-2 shadow-panel">
          {notifications.length === 0 ? (
            <p className="p-3 text-sm text-mute">No notifications yet.</p>
          ) : (
            <ul className="max-h-96 space-y-1 overflow-y-auto">
              {notifications.map((notification) => (
                <li key={notification.id}>
                  <Link
                    href={`/escrow/${notification.escrowId}`}
                    onClick={() => void handleMarkOne(notification.id)}
                    className={`block rounded-lg px-3 py-2 text-sm hover:bg-surface-2 ${
                      notification.isRead ? 'text-fog' : 'text-vellum'
                    }`}
                  >
                    {NOTIFICATION_EVENT_LABELS[notification.eventType]}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
