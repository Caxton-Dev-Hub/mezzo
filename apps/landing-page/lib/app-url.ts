const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";

export function appUrl(path: string): string {
  return `${APP_URL}${path}`;
}
