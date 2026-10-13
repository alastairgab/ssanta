import '@testing-library/jest-dom/vitest';
import { webcrypto } from 'node:crypto';

// jsdom's window may lack crypto.subtle; use Node's standards-compliant Web Crypto in tests.
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}
