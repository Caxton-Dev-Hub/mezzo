export const ALLOWED_IMAGE_MIME_TYPES: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
]);

export const ALLOWED_VIDEO_MIME_TYPES: ReadonlySet<string> = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
]);

export const ALLOWED_MIME_TYPES: ReadonlySet<string> = new Set([
  ...ALLOWED_IMAGE_MIME_TYPES,
  ...ALLOWED_VIDEO_MIME_TYPES,
]);

export function isImageMime(mime: string): boolean {
  return ALLOWED_IMAGE_MIME_TYPES.has(mime);
}
