import { describe, expect, it } from 'vitest';
import { transferExif } from '../lib/exif-transfer';

function segment(marker: number, payload: number[]): number[] {
  const length = payload.length + 2;
  return [0xff, marker, (length >> 8) & 0xff, length & 0xff, ...payload];
}

const EXIF_PAYLOAD = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0x4d, 0x4d, 0x00, 0x2a];
const JFIF_PAYLOAD = [0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x02];
const SCAN = [0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0xaa, 0xbb];

function jpeg(...parts: number[][]): Blob {
  return new Blob([new Uint8Array([0xff, 0xd8, ...parts.flat(), ...SCAN])], { type: 'image/jpeg' });
}

async function bytesOf(blob: Blob): Promise<number[]> {
  return Array.from(new Uint8Array(await blob.arrayBuffer()));
}

function indexOfSubsequence(haystack: number[], needle: number[]): number {
  return haystack.findIndex((_, index) =>
    needle.every((byte, offset) => haystack[index + offset] === byte),
  );
}

describe('transferExif', () => {
  it('copies the source EXIF segment into a canvas-encoded JPEG', async () => {
    const source = jpeg(segment(0xe1, EXIF_PAYLOAD));
    const target = jpeg(segment(0xe0, JFIF_PAYLOAD));

    const result = await bytesOf(await transferExif(source, target));

    expect(indexOfSubsequence(result, EXIF_PAYLOAD)).toBeGreaterThan(-1);
  });

  it('places the EXIF segment after the JFIF segment', async () => {
    const source = jpeg(segment(0xe1, EXIF_PAYLOAD));
    const target = jpeg(segment(0xe0, JFIF_PAYLOAD));

    const result = await bytesOf(await transferExif(source, target));

    expect(indexOfSubsequence(result, JFIF_PAYLOAD)).toBeLessThan(
      indexOfSubsequence(result, EXIF_PAYLOAD),
    );
  });

  it('places the EXIF segment directly after SOI when there is no JFIF segment', async () => {
    const source = jpeg(segment(0xe1, EXIF_PAYLOAD));
    const target = jpeg(segment(0xdb, [0x00, 0x01, 0x02]));

    const result = await bytesOf(await transferExif(source, target));

    expect(result.slice(0, 2)).toEqual([0xff, 0xd8]);
    expect(indexOfSubsequence(result, EXIF_PAYLOAD)).toBe(6);
  });

  it('preserves the scan data that follows the inserted segment', async () => {
    const source = jpeg(segment(0xe1, EXIF_PAYLOAD));
    const target = jpeg(segment(0xe0, JFIF_PAYLOAD));

    const result = await bytesOf(await transferExif(source, target));

    expect(result.slice(-SCAN.length)).toEqual(SCAN);
  });

  it('returns the target untouched when the source has no EXIF', async () => {
    const source = jpeg(segment(0xe0, JFIF_PAYLOAD));
    const target = jpeg(segment(0xe0, JFIF_PAYLOAD));

    const result = await transferExif(source, target);

    expect(result).toBe(target);
  });

  it('returns the target untouched when the source is not a JPEG', async () => {
    const source = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], {
      type: 'image/png',
    });
    const target = jpeg(segment(0xe0, JFIF_PAYLOAD));

    const result = await transferExif(source, target);

    expect(result).toBe(target);
  });

  it('does not add a second EXIF segment when the target already has one', async () => {
    const source = jpeg(segment(0xe1, EXIF_PAYLOAD));
    const target = jpeg(segment(0xe1, EXIF_PAYLOAD));

    const result = await transferExif(source, target);

    expect(result).toBe(target);
  });

  it('does not read past a truncated segment length', async () => {
    const source = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x7f, 0xff, 0x45, 0x78])], {
      type: 'image/jpeg',
    });
    const target = jpeg(segment(0xe0, JFIF_PAYLOAD));

    const result = await transferExif(source, target);

    expect(result).toBe(target);
  });
});
