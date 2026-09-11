const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

const ED25519_PUBLIC_KEY_VERSION_BYTE = 0x30;

const STRKEY_LENGTH = 56;

const RAW_KEY_LENGTH = 32;

function crc16XModem(bytes: Uint8Array): number {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}

function decodeBase32(value: string): Uint8Array | null {
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;

  for (const character of value) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index === -1) {
      return null;
    }
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }

  return Uint8Array.from(bytes);
}

function encodeBase32(bytes: Uint8Array): string {
  let output = '';
  let buffer = 0;
  let bits = 0;

  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      output += BASE32_ALPHABET[(buffer >> bits) & 0x1f];
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(buffer << (5 - bits)) & 0x1f];
  }

  return output;
}

export function isStellarAccountId(value: string): boolean {
  if (value.length !== STRKEY_LENGTH) {
    return false;
  }

  const decoded = decodeBase32(value);
  if (!decoded || decoded.length !== 1 + RAW_KEY_LENGTH + 2) {
    return false;
  }

  if (decoded[0] !== ED25519_PUBLIC_KEY_VERSION_BYTE) {
    return false;
  }

  const payload = decoded.subarray(0, 1 + RAW_KEY_LENGTH);
  const checksum = decoded[33] | (decoded[34] << 8);

  return crc16XModem(payload) === checksum;
}

export function encodeStellarAccountId(rawPublicKey: Uint8Array): string {
  if (rawPublicKey.length !== RAW_KEY_LENGTH) {
    throw new RangeError(`A Stellar public key is ${RAW_KEY_LENGTH} bytes`);
  }

  const payload = new Uint8Array(1 + RAW_KEY_LENGTH);
  payload[0] = ED25519_PUBLIC_KEY_VERSION_BYTE;
  payload.set(rawPublicKey, 1);

  const checksum = crc16XModem(payload);
  const full = new Uint8Array(payload.length + 2);
  full.set(payload);
  full[payload.length] = checksum & 0xff;
  full[payload.length + 1] = (checksum >> 8) & 0xff;

  return encodeBase32(full);
}
