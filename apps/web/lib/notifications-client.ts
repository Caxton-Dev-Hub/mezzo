import type { NotificationResponse } from '@mezzo/shared-types';
import { apiRequest } from './api-client';

export function getNotifications(): Promise<NotificationResponse[]> {
  return apiRequest<NotificationResponse[]>('/notifications');
}

export function markNotificationRead(id: string): Promise<NotificationResponse> {
  return apiRequest<NotificationResponse>(`/notifications/${id}/read`, { method: 'PATCH' });
}

export function markAllNotificationsRead(): Promise<void> {
  return apiRequest<void>('/notifications/read-all', { method: 'PATCH' });
}
