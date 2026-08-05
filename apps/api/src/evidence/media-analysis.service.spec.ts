import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MediaAnalysisService } from './media-analysis.service';

const fixturesDir = join(__dirname, '..', '..', 'test', 'fixtures', 'evidence');

function readFixture(name: string): Buffer {
  return readFileSync(join(fixturesDir, name));
}

describe('MediaAnalysisService', () => {
  const service = new MediaAnalysisService();

  it('computes a correct SHA-256 content hash', async () => {
    const buffer = readFixture('with-exif.jpg');
    const result = await service.analyze(buffer);

    const expectedHash = createHash('sha256').update(buffer).digest('hex');
    expect(result.contentHash).toBe(expectedHash);
    expect(result.contentHash).toHaveLength(64);
  });

  it('produces an identical hash for identical bytes', async () => {
    const buffer = readFixture('with-exif.jpg');
    const first = await service.analyze(buffer);
    const second = await service.analyze(Buffer.from(buffer));

    expect(first.contentHash).toBe(second.contentHash);
  });

  it('detects the actual mime type from magic bytes, independent of any label', async () => {
    const jpeg = await service.analyze(readFixture('with-exif.jpg'));
    const png = await service.analyze(readFixture('plain.png'));

    expect(jpeg.detectedMime).toBe('image/jpeg');
    expect(png.detectedMime).toBe('image/png');
  });

  it('extracts EXIF capture timestamp, device, and GPS when present', async () => {
    const result = await service.analyze(readFixture('with-exif.jpg'));

    expect(result.hasExif).toBe(true);
    expect(result.capturedAt).toEqual(new Date('2026-07-20T10:30:00.000Z'));
    expect(result.deviceMake).toBe('MezzoCam');
    expect(result.deviceModel).toBe('MezzoCam Model X');
    expect(result.gpsLatitude).toBeCloseTo(6.5244, 3);
    expect(result.gpsLongitude).toBeCloseTo(3.3792, 3);
  });

  it('reports no EXIF for an image that was never tagged, without throwing', async () => {
    const result = await service.analyze(readFixture('without-exif.jpg'));

    expect(result.hasExif).toBe(false);
    expect(result.capturedAt).toBeNull();
    expect(result.deviceMake).toBeNull();
    expect(result.gpsLatitude).toBeNull();
  });

  it('reads image dimensions', async () => {
    const result = await service.analyze(readFixture('with-exif.jpg'));
    expect(result.width).toBe(640);
    expect(result.height).toBe(480);
  });

  it('never extracts EXIF or dimensions for a non-image mime type', async () => {
    const video = Buffer.concat([
      Buffer.from([0x00, 0x00, 0x00, 0x20]),
      Buffer.from('ftyp'),
      Buffer.from('isom'),
      Buffer.alloc(32),
    ]);
    const result = await service.analyze(video);

    expect(result.detectedMime).toBe('video/mp4');
    expect(result.width).toBeNull();
    expect(result.height).toBeNull();
    expect(result.hasExif).toBe(false);
  });

  it('handles unrecognizable and empty buffers without throwing', async () => {
    const garbage = await service.analyze(Buffer.from('not an image, just text'));
    expect(garbage.detectedMime).toBeNull();
    expect(garbage.hasExif).toBe(false);

    const empty = await service.analyze(Buffer.alloc(0));
    expect(empty.detectedMime).toBeNull();
    expect(empty.sizeBytes).toBe(0);
  });
});
