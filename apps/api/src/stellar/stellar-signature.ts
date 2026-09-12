import { createHash } from 'node:crypto';
import { Keypair } from '@stellar/stellar-sdk';

const BASE64 = /^[A-Za-z0-9+/_-]+={0,2}$/;
const HEX = /^[0-9a-fA-F]+$/;
const SIGNATURE_BYTES = 64;

function decodeSignature(signature: string): Buffer[] {
  const candidates: Buffer[] = [];

  if (HEX.test(signature) && signature.length % 2 === 0) {
    candidates.push(Buffer.from(signature, 'hex'));
  }

  if (BASE64.test(signature)) {
    candidates.push(Buffer.from(signature, 'base64'));
  }

  return candidates.filter((candidate) => candidate.length === SIGNATURE_BYTES);
}

function signedPayloads(message: string): Buffer[] {
  const raw = Buffer.from(message, 'utf8');
  return [raw, createHash('sha256').update(raw).digest()];
}

export function verifyStellarSignature(
  accountId: string,
  message: string,
  signature: string,
): boolean {
  let keypair: Keypair;
  try {
    keypair = Keypair.fromPublicKey(accountId);
  } catch {
    return false;
  }

  const signatures = decodeSignature(signature);
  if (signatures.length === 0) {
    return false;
  }

  return signedPayloads(message).some((payload) =>
    signatures.some((candidate) => {
      try {
        return keypair.verify(payload, candidate);
      } catch {
        return false;
      }
    }),
  );
}
