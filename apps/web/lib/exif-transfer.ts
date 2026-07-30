const MARKER_APP0 = 0xe0;
const MARKER_APP1 = 0xe1;
const MARKER_SOS = 0xda;
const EXIF_HEADER = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00];

interface JpegSegment {
  marker: number;
  start: number;
  end: number;
}

function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

function* walkSegments(bytes: Uint8Array): Generator<JpegSegment> {
  let offset = 2;

  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return;

    let markerOffset = offset + 1;
    while (markerOffset < bytes.length && bytes[markerOffset] === 0xff) {
      markerOffset += 1;
    }

    const marker = bytes[markerOffset];
    if (marker === undefined || marker === MARKER_SOS) return;

    const lengthOffset = markerOffset + 1;
    if (lengthOffset + 2 > bytes.length) return;

    const length = (bytes[lengthOffset] << 8) | bytes[lengthOffset + 1];
    if (length < 2) return;

    const end = lengthOffset + length;
    if (end > bytes.length) return;

    yield { marker, start: markerOffset - 1, end };
    offset = end;
  }
}

function readExifSegment(bytes: Uint8Array): Uint8Array | null {
  if (!isJpeg(bytes)) return null;

  for (const segment of walkSegments(bytes)) {
    if (segment.marker !== MARKER_APP1) continue;
    const payload = segment.start + 4;
    if (EXIF_HEADER.every((byte, index) => bytes[payload + index] === byte)) {
      return bytes.slice(segment.start, segment.end);
    }
  }

  return null;
}

function exifInsertOffset(bytes: Uint8Array): number {
  for (const segment of walkSegments(bytes)) {
    return segment.marker === MARKER_APP0 ? segment.end : segment.start;
  }
  return 2;
}

export async function transferExif(source: Blob, target: Blob): Promise<Blob> {
  const segment = readExifSegment(new Uint8Array(await source.arrayBuffer()));
  if (!segment) return target;

  const targetBytes = new Uint8Array(await target.arrayBuffer());
  if (!isJpeg(targetBytes) || readExifSegment(targetBytes)) return target;

  const offset = exifInsertOffset(targetBytes);

  return new Blob([targetBytes.subarray(0, offset), segment, targetBytes.subarray(offset)] as any, {
    type: 'image/jpeg',
  });
}
