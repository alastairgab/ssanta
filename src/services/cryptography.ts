import { base64ToBytes, base64UrlToBytes, bytesToBase64, bytesToBase64Url, bytesToHex, utf8 } from '../utils/base64';
import { secureRandomBytes } from '../utils/random';

/**
 * All cryptography uses the browser's Web Crypto API (crypto.subtle). Nothing here is
 * "encoding as encryption": every confidential payload is AES-256-GCM authenticated encryption
 * with a fresh random 96-bit IV.
 *
 *  - Sealed links (reveal / question / answer / wishlist-request): a fresh random 256-bit key per
 *    link. The key travels in the URL fragment, which browsers never send to the web server.
 *  - Relay packets (participant → organiser): ECDH P-256 with an ephemeral sender key, HKDF-SHA-256
 *    to derive an AES-256-GCM key. Only the holder of the organiser's private key can decrypt.
 *  - Encrypted backups: PBKDF2-SHA-256 (600 000 iterations) password → AES-256-GCM.
 *  - Draw fingerprints: SHA-256.
 */

export class CryptoError extends Error {
  constructor(
    public code: 'malformed' | 'decrypt-failed' | 'unsupported' | 'wrong-password',
    message: string,
  ) {
    super(message);
    this.name = 'CryptoError';
  }
}

const subtle = () => {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new CryptoError('unsupported', 'This browser does not support secure encryption (Web Crypto). Please use an up-to-date browser over HTTPS.');
  return s;
};

const IV_BYTES = 12;
const FLAG_RAW = 0;
const FLAG_DEFLATE = 1;

async function streamTransform(data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([data]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

export async function compress(data: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream === 'undefined') {
    const out = new Uint8Array(data.length + 1);
    out[0] = FLAG_RAW;
    out.set(data, 1);
    return out;
  }
  const deflated = await streamTransform(data, new CompressionStream('deflate-raw'));
  const useDeflate = deflated.length < data.length;
  const body = useDeflate ? deflated : data;
  const out = new Uint8Array(body.length + 1);
  out[0] = useDeflate ? FLAG_DEFLATE : FLAG_RAW;
  out.set(body, 1);
  return out;
}

export async function decompress(data: Uint8Array): Promise<Uint8Array> {
  const flag = data[0];
  const body = data.subarray(1);
  if (flag === FLAG_RAW) return body;
  if (flag === FLAG_DEFLATE) {
    if (typeof DecompressionStream === 'undefined') {
      throw new CryptoError('unsupported', 'This browser is too old to open this link. Please update your browser.');
    }
    return streamTransform(body, new DecompressionStream('deflate-raw'));
  }
  throw new CryptoError('malformed', 'Unknown payload format');
}

const aad = (kind: string) => utf8.encode(`secret-santa:${kind}:v1`);

export async function aesEncrypt(key: CryptoKey, plaintext: Uint8Array, additionalData: Uint8Array): Promise<Uint8Array> {
  const iv = secureRandomBytes(IV_BYTES);
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv, additionalData }, key, plaintext));
  const out = new Uint8Array(IV_BYTES + ct.length);
  out.set(iv, 0);
  out.set(ct, IV_BYTES);
  return out;
}

export async function aesDecrypt(key: CryptoKey, blob: Uint8Array, additionalData: Uint8Array): Promise<Uint8Array> {
  if (blob.length < IV_BYTES + 16) throw new CryptoError('malformed', 'Encrypted data is too short');
  const iv = blob.subarray(0, IV_BYTES);
  const ct = blob.subarray(IV_BYTES);
  try {
    return new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv, additionalData }, key, ct));
  } catch {
    throw new CryptoError('decrypt-failed', 'The link could not be decrypted. It may be incomplete or altered.');
  }
}

// ---------------------------------------------------------------------------
// Sealed links (symmetric, key in URL fragment)
// ---------------------------------------------------------------------------

export interface Sealed {
  ciphertext: string; // base64url
  key: string; // base64url (32 bytes)
}

export async function sealJson(kind: string, value: unknown): Promise<Sealed> {
  const rawKey = secureRandomBytes(32);
  const key = await subtle().importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['encrypt']);
  const plaintext = await compress(utf8.encode(JSON.stringify(value)));
  const blob = await aesEncrypt(key, plaintext, aad(kind));
  return { ciphertext: bytesToBase64Url(blob), key: bytesToBase64Url(rawKey) };
}

export async function openSealedJson(kind: string, ciphertext: string, keyB64: string): Promise<unknown> {
  let rawKey: Uint8Array;
  let blob: Uint8Array;
  try {
    rawKey = base64UrlToBytes(keyB64);
    blob = base64UrlToBytes(ciphertext);
  } catch {
    throw new CryptoError('malformed', 'The link is damaged (invalid characters).');
  }
  if (rawKey.length !== 32) throw new CryptoError('malformed', 'The link key is incomplete.');
  const key = await subtle().importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['decrypt']);
  const plain = await aesDecrypt(key, blob, aad(kind));
  try {
    return JSON.parse(utf8.decode(await decompress(plain)));
  } catch (e) {
    if (e instanceof CryptoError) throw e;
    throw new CryptoError('malformed', 'The link contents are not readable.');
  }
}

// ---------------------------------------------------------------------------
// Relay packets (asymmetric, participant → organiser)
// ---------------------------------------------------------------------------

const ECDH = { name: 'ECDH', namedCurve: 'P-256' } as const;
const RELAY_INFO = utf8.encode('secret-santa-relay-v1');
export const PACKET_PREFIX = 'SECRET-SANTA-PACKET:1:';

export async function generateRelayKeyPair(): Promise<{ publicKeyJwk: JsonWebKey; privateKeyJwk: JsonWebKey }> {
  const pair = (await subtle().generateKey(ECDH, true, ['deriveBits'])) as CryptoKeyPair;
  const publicKeyJwk = await subtle().exportKey('jwk', pair.publicKey);
  const privateKeyJwk = await subtle().exportKey('jwk', pair.privateKey);
  return { publicKeyJwk: minimalPublicJwk(publicKeyJwk), privateKeyJwk };
}

/** Keep only the fields needed to import a P-256 public key (keeps links short). */
export function minimalPublicJwk(jwk: JsonWebKey): JsonWebKey {
  return { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y };
}

async function relayAesKey(sharedBits: ArrayBuffer, salt: Uint8Array, usage: KeyUsage): Promise<CryptoKey> {
  const hkdfKey = await subtle().importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);
  return subtle().deriveKey({ name: 'HKDF', hash: 'SHA-256', salt, info: RELAY_INFO }, hkdfKey, { name: 'AES-GCM', length: 256 }, false, [usage]);
}

export async function encryptToPublicKey(publicKeyJwk: JsonWebKey, value: unknown): Promise<string> {
  let recipientKey: CryptoKey;
  try {
    recipientKey = await subtle().importKey('jwk', minimalPublicJwk(publicKeyJwk), ECDH, false, []);
  } catch {
    throw new CryptoError('malformed', 'The organiser key in this link is invalid.');
  }
  const eph = (await subtle().generateKey(ECDH, true, ['deriveBits'])) as CryptoKeyPair;
  const ephRaw = new Uint8Array(await subtle().exportKey('raw', eph.publicKey));
  const bits = await subtle().deriveBits({ name: 'ECDH', public: recipientKey }, eph.privateKey, 256);
  const aesKey = await relayAesKey(bits, ephRaw, 'encrypt');
  const plain = await compress(utf8.encode(JSON.stringify(value)));
  const blob = await aesEncrypt(aesKey, plain, aad('relay'));
  const out = new Uint8Array(ephRaw.length + blob.length);
  out.set(ephRaw, 0);
  out.set(blob, ephRaw.length);
  return PACKET_PREFIX + bytesToBase64Url(out);
}

/** Extract a packet from pasted text (which may include a surrounding chat message). */
export function extractPacket(text: string): string | null {
  const idx = text.indexOf(PACKET_PREFIX);
  if (idx < 0) return null;
  const m = /^[A-Za-z0-9_-]+/.exec(text.slice(idx + PACKET_PREFIX.length));
  return m ? PACKET_PREFIX + m[0] : null;
}

export async function decryptWithPrivateKey(privateKeyJwk: JsonWebKey, packetText: string): Promise<unknown> {
  const packet = extractPacket(packetText);
  if (!packet) throw new CryptoError('malformed', 'No Secret Santa message was found in the pasted text.');
  let bytes: Uint8Array;
  try {
    bytes = base64UrlToBytes(packet.slice(PACKET_PREFIX.length));
  } catch {
    throw new CryptoError('malformed', 'The message is damaged (invalid characters).');
  }
  if (bytes.length < 65 + IV_BYTES + 16) throw new CryptoError('malformed', 'The message is incomplete.');
  const ephRaw = bytes.subarray(0, 65);
  let ephKey: CryptoKey;
  try {
    ephKey = await subtle().importKey('raw', ephRaw, ECDH, false, []);
  } catch {
    throw new CryptoError('malformed', 'The message is damaged.');
  }
  const priv = await subtle().importKey('jwk', privateKeyJwk, ECDH, false, ['deriveBits']);
  let bits: ArrayBuffer;
  try {
    bits = await subtle().deriveBits({ name: 'ECDH', public: ephKey }, priv, 256);
  } catch {
    throw new CryptoError('decrypt-failed', 'This message was not encrypted for this event.');
  }
  const aesKey = await relayAesKey(bits, new Uint8Array(ephRaw), 'decrypt');
  let plain: Uint8Array;
  try {
    plain = await aesDecrypt(aesKey, bytes.subarray(65), aad('relay'));
  } catch {
    throw new CryptoError('decrypt-failed', 'This message could not be decrypted. It may belong to a different event or have been altered.');
  }
  try {
    return JSON.parse(utf8.decode(await decompress(plain)));
  } catch {
    throw new CryptoError('malformed', 'The message contents are not readable.');
  }
}

// ---------------------------------------------------------------------------
// Password-based encryption (backups)
// ---------------------------------------------------------------------------

export const PBKDF2_ITERATIONS = 600_000;

export async function passwordEncrypt(password: string, plaintext: Uint8Array, iterations = PBKDF2_ITERATIONS) {
  const salt = secureRandomBytes(16);
  const key = await passwordKey(password, salt, iterations, 'encrypt');
  const blob = await aesEncrypt(key, plaintext, aad('backup'));
  return {
    saltB64: bytesToBase64(salt),
    ivB64: bytesToBase64(blob.subarray(0, IV_BYTES)),
    ciphertextB64: bytesToBase64(blob.subarray(IV_BYTES)),
    iterations,
  };
}

export async function passwordDecrypt(password: string, enc: { saltB64: string; ivB64: string; ciphertextB64: string; iterations: number }) {
  const key = await passwordKey(password, base64ToBytes(enc.saltB64), enc.iterations, 'decrypt');
  const iv = base64ToBytes(enc.ivB64);
  const ct = base64ToBytes(enc.ciphertextB64);
  const blob = new Uint8Array(iv.length + ct.length);
  blob.set(iv, 0);
  blob.set(ct, iv.length);
  try {
    return await aesDecrypt(key, blob, aad('backup'));
  } catch {
    throw new CryptoError('wrong-password', 'The password is incorrect, or the backup file is damaged.');
  }
}

async function passwordKey(password: string, salt: Uint8Array, iterations: number, usage: KeyUsage) {
  if (!Number.isInteger(iterations) || iterations < 100_000 || iterations > 10_000_000) {
    throw new CryptoError('malformed', 'Unsupported backup key settings.');
  }
  const base = await subtle().importKey('raw', utf8.encode(password), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, [usage]);
}

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

export async function sha256Hex(text: string): Promise<string> {
  const digest = await subtle().digest('SHA-256', utf8.encode(text));
  return bytesToHex(new Uint8Array(digest));
}
