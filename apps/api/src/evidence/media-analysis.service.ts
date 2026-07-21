import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { imageSize } from 'image-size';
import * as exifr from 'exifr';
import { fromBuffer as fileTypeFromBuffer } from 'file-type';
import { isImageMime } from './allowed-media-types';

export interface MediaAnalysisResult {
  contentHash: string;
  detectedMime: string | null;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  capturedAt: Date | null;
  deviceMake: string | null;
  deviceModel: string | null;
  gpsLatitude: number | null;
  gpsLongitude: number | null;
  hasExif: boolean;
}

interface ParsedExif {
  DateTimeOriginal?: unknown;
  CreateDate?: unknown;
  Make?: unknown;
  Model?: unknown;
  latitude?: unknown;
  longitude?: unknown;
}

@Injectable()
export class MediaAnalysisService {
  async analyze(buffer: Buffer): Promise<MediaAnalysisResult> {
    const contentHash = createHash('sha256').update(buffer).digest('hex');
    const sizeBytes = buffer.length;
    const detectedMime = await this.detectMime(buffer);

    const base: MediaAnalysisResult = {
      contentHash,
      detectedMime,
      sizeBytes,
      width: null,
      height: null,
      capturedAt: null,
      deviceMake: null,
      deviceModel: null,
      gpsLatitude: null,
      gpsLongitude: null,
      hasExif: false,
    };

    if (!detectedMime || !isImageMime(detectedMime)) {
      return base;
    }

    const dimensions = this.readDimensions(buffer);
    const exif = await this.readExif(buffer);

    return { ...base, ...dimensions, ...exif };
  }

  private async detectMime(buffer: Buffer): Promise<string | null> {
    const detected = await fileTypeFromBuffer(buffer);
    return detected?.mime ?? null;
  }

  private readDimensions(buffer: Buffer): Pick<MediaAnalysisResult, 'width' | 'height'> {
    try {
      const dimensions = imageSize(buffer);
      return { width: dimensions.width ?? null, height: dimensions.height ?? null };
    } catch {
      return { width: null, height: null };
    }
  }

  private async readExif(
    buffer: Buffer,
  ): Promise<
    Pick<
      MediaAnalysisResult,
      'capturedAt' | 'deviceMake' | 'deviceModel' | 'gpsLatitude' | 'gpsLongitude' | 'hasExif'
    >
  > {
    const empty = {
      capturedAt: null,
      deviceMake: null,
      deviceModel: null,
      gpsLatitude: null,
      gpsLongitude: null,
      hasExif: false,
    } as const;

    try {
      const parsed = (await exifr.parse(buffer, { gps: true })) as ParsedExif | undefined;
      if (!parsed) {
        return empty;
      }

      const capturedAtRaw = parsed.DateTimeOriginal ?? parsed.CreateDate;
      const capturedAt = capturedAtRaw instanceof Date ? capturedAtRaw : null;
      const deviceMake = typeof parsed.Make === 'string' ? parsed.Make : null;
      const deviceModel = typeof parsed.Model === 'string' ? parsed.Model : null;
      const gpsLatitude = typeof parsed.latitude === 'number' ? parsed.latitude : null;
      const gpsLongitude = typeof parsed.longitude === 'number' ? parsed.longitude : null;

      const hasExif =
        capturedAt !== null ||
        deviceMake !== null ||
        deviceModel !== null ||
        gpsLatitude !== null ||
        gpsLongitude !== null;

      return { capturedAt, deviceMake, deviceModel, gpsLatitude, gpsLongitude, hasExif };
    } catch {
      return empty;
    }
  }
}
