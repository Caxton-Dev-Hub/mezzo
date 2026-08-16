'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Check } from 'lucide-react';
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
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleClickOutside(event: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

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

  function handleOpen(): void {
    setOpen((current) => !current);
  }

  async function handleMarkAll(): Promise<void> {
    await markAllNotificationsRead();
    queryClient.setQueryData<NotificationResponse[]>(['notifications'], (current) =>
      current?.map((item) => ({ ...item, isRead: true, readAt: new Date() })),
    );
  }

  async function handleMarkOne(id: string): Promise<void> {
    await markNotificationRead(id);
    queryClient.setQueryData<NotificationResponse[]>(['notifications'], (current) =>
      current?.map((item) =>
        item.id === id ? { ...item, isRead: true, readAt: new Date() } : item,
      ),
    );
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={handleOpen}
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
        <div className="fixed inset-x-4 top-20 z-40 max-h-[70vh] overflow-hidden rounded-xl border border-line-soft bg-surface shadow-card p-2 shadow-panel sm:absolute sm:inset-x-auto sm:top-auto sm:right-0 sm:mt-2 sm:w-80 sm:max-h-none">
          <div className="flex items-center justify-between gap-3 px-2 py-1.5">
            <span className="text-sm font-medium text-vellum">Notifications</span>
            {unreadCount > 0 ? (
              <button
                type="button"
                onClick={() => void handleMarkAll()}
                className="shrink-0 text-[13px] font-medium text-mint hover:underline"
              >
                Mark all read
              </button>
            ) : null}
          </div>
          {notifications.length === 0 ? (
            <p className="p-3 text-sm text-mute">No notifications yet.</p>
          ) : (
            <ul className="max-h-[calc(70vh-2.5rem)] space-y-1 overflow-y-auto sm:max-h-96">
              {notifications.slice(0, 5).map((notification) => (
                <li key={notification.id} className="flex items-center gap-1">
                  <Link
                    href={`/escrow/${notification.escrowId}`}
                    onClick={() => void handleMarkOne(notification.id)}
                    className={`block flex-1 truncate rounded-lg px-3 py-2 text-sm hover:bg-surface-2 ${
                      notification.isRead ? 'text-fog' : 'text-vellum'
                    }`}
                  >
                    {NOTIFICATION_EVENT_LABELS[notification.eventType]}
                  </Link>
                  {!notification.isRead ? (
                    <button
                      type="button"
                      aria-label="Mark as read"
                      onClick={() => void handleMarkOne(notification.id)}
                      className="shrink-0 rounded-full p-1.5 text-fog hover:bg-surface-2 hover:text-vellum"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
