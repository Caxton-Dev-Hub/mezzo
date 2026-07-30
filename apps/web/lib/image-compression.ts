import { transferExif } from './exif-transfer';

export interface CompressedImage {
  blob: Blob;
  mimeType: string;
  width: number;
  height: number;
}

const MAX_DIMENSION = 1920;
const JPEG_QUALITY = 0.82;

export async function compressImage(file: File): Promise<CompressedImage> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'none' });
  const originalWidth = bitmap.width;
  const originalHeight = bitmap.height;
  const scale = Math.min(1, MAX_DIMENSION / Math.max(originalWidth, originalHeight));
  const width = Math.round(originalWidth * scale);
  const height = Math.round(originalHeight * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return { blob: file, mimeType: file.type, width: originalWidth, height: originalHeight };
  }

  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const encoded = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
  );

  if (!encoded) {
    return { blob: file, mimeType: file.type, width: originalWidth, height: originalHeight };
  }

  const blob = await transferExif(file, encoded);

  if (blob.size >= file.size) {
    return { blob: file, mimeType: file.type, width: originalWidth, height: originalHeight };
  }

  return { blob, mimeType: 'image/jpeg', width, height };
}
