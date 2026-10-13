/**
 * Cryptographically secure randomness helpers built on crypto.getRandomValues.
 * Math.random is never used for anything that influences a draw.
 */

/** Uniform integer in [0, maxExclusive) using rejection sampling (no modulo bias). */
export function secureRandomInt(maxExclusive: number): number {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
    throw new RangeError('maxExclusive must be a positive integer');
  }
  if (maxExclusive === 1) return 0;
  const limit = Math.floor(0x100000000 / maxExclusive) * maxExclusive;
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    const x = buf[0]!;
    if (x < limit) return x % maxExclusive;
  }
}

/** Uniform float in [0, 1) with 53 bits of entropy. */
export function secureRandomFloat(): number {
  const buf = new Uint32Array(2);
  crypto.getRandomValues(buf);
  return ((buf[0]! >>> 11) * 0x100000000 + buf[1]!) / 2 ** 53;
}

/** Fisher–Yates shuffle (returns a new array). */
export function secureShuffle<T>(items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = secureRandomInt(i + 1);
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

export function secureRandomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

export function pickRandom<T>(items: readonly T[]): T {
  if (items.length === 0) throw new RangeError('Cannot pick from an empty list');
  return items[secureRandomInt(items.length)]!;
}
