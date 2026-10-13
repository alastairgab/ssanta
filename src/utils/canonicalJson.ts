/**
 * ss-canonical-json-v1 — deterministic JSON serialisation used for draw fingerprints.
 *
 * Procedure:
 *  1. Object keys are sorted by UTF-16 code unit order (Array.prototype.sort default).
 *  2. Keys whose value is `undefined` are omitted (as JSON.stringify does).
 *  3. Arrays keep their order (callers sort arrays that represent sets before hashing).
 *  4. Numbers must be finite; they are emitted in JSON.stringify's shortest form.
 *  5. Strings use JSON.stringify escaping. No insignificant whitespace anywhere.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'string':
      return JSON.stringify(value);
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(value)) throw new Error('Non-finite numbers cannot be canonicalised');
      return JSON.stringify(value);
    case 'object': {
      if (Array.isArray(value)) {
        return `[${value.map((v) => (v === undefined ? 'null' : canonicalJson(v))).join(',')}]`;
      }
      const obj = value as Record<string, unknown>;
      const keys = Object.keys(obj)
        .filter((k) => obj[k] !== undefined)
        .sort();
      return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`;
    }
    default:
      throw new Error(`Unsupported type in canonical JSON: ${typeof value}`);
  }
}
