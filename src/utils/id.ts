import { secureRandomBytes } from './random';

const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'; // Crockford base32, lower-case

/**
 * Random, non-predictable identifier (120 bits of entropy).
 * Optional prefix makes IDs self-describing in exports ("p", "ev", ...).
 */
export function newId(prefix = ''): string {
  const bytes = secureRandomBytes(24);
  let out = '';
  for (const b of bytes) out += ALPHABET[b & 31];
  return prefix ? `${prefix}_${out}` : out;
}

export const nowIso = (): string => new Date().toISOString();
