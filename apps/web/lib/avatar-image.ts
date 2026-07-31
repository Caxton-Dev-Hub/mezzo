import { ApiError } from './api-error';

const MAX_AVATAR_DIMENSION = 512;
const AVATAR_QUALITY = 0.85;

export interface PreparedAvatar {
  blob: Blob;
  mimeType: 'image/jpeg';
}

export async function prepareAvatar(file: File): Promise<PreparedAvatar> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_AVATAR_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    bitmap.close();
    throw new ApiError({
      statusCode: 0,
      code: 'AVATAR_ENCODE_FAILED',
      message: 'Could not read that image. Try a different file.',
    });
  }

  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', AVATAR_QUALITY),
  );

  if (!blob) {
    throw new ApiError({
      statusCode: 0,
      code: 'AVATAR_ENCODE_FAILED',
      message: 'Could not read that image. Try a different file.',
    });
  }

  return { blob, mimeType: 'image/jpeg' };
}
