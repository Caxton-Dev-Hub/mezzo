import type { LoginDto, RegisterDto, UserResponse } from '@mezzo/shared-types';
import { ApiError } from './api-error';

export interface LoginResult {
  accessToken: string;
  user: UserResponse;
}

export interface RefreshResult {
  accessToken: string;
  user: UserResponse;
}

async function postJson<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });

  if (!response.ok) {
    throw await ApiError.fromResponse(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function registerRequest(dto: RegisterDto): Promise<UserResponse> {
  return postJson<UserResponse>('/api/auth/register', dto);
}

export function loginRequest(dto: LoginDto): Promise<LoginResult> {
  return postJson<LoginResult>('/api/auth/login', dto);
}

export function refreshRequest(): Promise<RefreshResult> {
  return postJson<RefreshResult>('/api/auth/refresh');
}

export function logoutRequest(): Promise<void> {
  return postJson<void>('/api/auth/logout');
}
