import { useAuthStore } from './auth-store';
import { ensureFreshSession } from './auth-client';
import { ApiError } from './api-error';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  skipAuth?: boolean;
}

async function performFetch(path: string, options: RequestOptions, token: string | null) {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (token && !options.skipAuth) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = useAuthStore.getState().accessToken;
  let response = await performFetch(path, options, token);

  if (response.status === 401 && !options.skipAuth) {
    const newToken = await ensureFreshSession();
    if (newToken) {
      response = await performFetch(path, options, newToken);
    }
  }

  if (!response.ok) {
    throw await ApiError.fromResponse(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function apiRequestBlob(path: string, options: RequestOptions = {}): Promise<Blob> {
  const token = useAuthStore.getState().accessToken;
  let response = await performFetch(path, options, token);

  if (response.status === 401 && !options.skipAuth) {
    const newToken = await ensureFreshSession();
    if (newToken) {
      response = await performFetch(path, options, newToken);
    }
  }

  if (!response.ok) {
    throw await ApiError.fromResponse(response);
  }

  return response.blob();
}
