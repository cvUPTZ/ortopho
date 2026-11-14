import type {DB, EncryptedPayload} from './types';

const PBKDF2_ITERATIONS = 250_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function isWebCryptoAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.crypto !== 'undefined' &&
    typeof window.crypto.subtle !== 'undefined'
  );
}

async function deriveAesKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  if (!isWebCryptoAvailable()) {
    throw new Error('WEB_CRYPTO_UNAVAILABLE');
  }
  const encoder = new TextEncoder();
  const baseKey = await window.crypto.subtle.importKey(
    'raw',
    encoder.encode(pin),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  const saltBuffer = new Uint8Array(salt).buffer;
  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    {name: 'AES-GCM', length: 256},
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptDB(db: DB, pin: string): Promise<EncryptedPayload> {
  if (!isWebCryptoAvailable()) {
    throw new Error('WEB_CRYPTO_UNAVAILABLE');
  }
  const salt = window.crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = window.crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveAesKey(pin, salt);
  const encoder = new TextEncoder();
  const plaintext = encoder.encode(JSON.stringify(db));
  const ivBuffer = new Uint8Array(iv).buffer;
  const ciphertext = await window.crypto.subtle.encrypt(
    {name: 'AES-GCM', iv: ivBuffer},
    key,
    plaintext,
  );
  return {
    enc: 1,
    s: toBase64(salt),
    i: toBase64(iv),
    c: toBase64(new Uint8Array(ciphertext)),
  };
}

export async function decryptPayload(payload: EncryptedPayload, pin: string): Promise<unknown> {
  if (!isEncryptedPayload(payload)) {
    throw new Error('INVALID_PAYLOAD');
  }
  const salt = fromBase64(payload.s);
  const iv = fromBase64(payload.i);
  const ciphertext = fromBase64(payload.c);
  const key = await deriveAesKey(pin, salt);
  const ivBuffer = new Uint8Array(iv).buffer;
  const ctBuffer = new Uint8Array(ciphertext).buffer;
  const plaintext = await window.crypto.subtle.decrypt(
    {name: 'AES-GCM', iv: ivBuffer},
    key,
    ctBuffer,
  );
  const decoder = new TextDecoder();
  return JSON.parse(decoder.decode(plaintext));
}

export function isEncryptedPayload(val: unknown): val is EncryptedPayload {
  if (!val || typeof val !== 'object') return false;
  const obj = val as Record<string, unknown>;
  return (
    obj.enc === 1 &&
    typeof obj.s === 'string' &&
    typeof obj.i === 'string' &&
    typeof obj.c === 'string' &&
    obj.s.length > 0 &&
    obj.i.length > 0 &&
    obj.c.length > 0
  );
}
