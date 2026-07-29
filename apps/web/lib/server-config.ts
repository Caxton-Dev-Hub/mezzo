export const REFRESH_COOKIE_NAME = 'mezzo_rt';

export function apiInternalUrl(): string {
  return process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
}
