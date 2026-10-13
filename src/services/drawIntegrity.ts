import type { DrawIntegrityRecord, DrawSnapshot, EventRules } from '../types/models';
import { canonicalJson } from '../utils/canonicalJson';
import { sha256Hex } from './cryptography';
import { nowIso } from '../utils/id';

/**
 * Draw integrity fingerprints.
 *
 * fingerprint = SHA-256( ss-canonical-json-v1( normaliseSnapshot(snapshot) ) )
 *
 * normaliseSnapshot sorts every set-like array (participants by id, assignments by giver id,
 * rule lists by id) so logically identical snapshots always hash identically. The canonical JSON
 * procedure is documented in utils/canonicalJson.ts.
 *
 * A fingerprint lets the organiser check that a draw has not changed since it was recorded
 * (e.g. compare against a value written down or shared on confirmation day). It is NOT a digital
 * signature: anyone can compute a hash, so it does not prove who created or approved a draw.
 */

const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function normaliseRules(rules: EventRules): EventRules {
  return {
    ...rules,
    forced: [...rules.forced].sort(byId),
    forbidden: [...rules.forbidden].sort(byId),
    history: { ...rules.history, sourceSeriesIds: [...rules.history.sourceSeriesIds].sort() },
  };
}

export function normaliseSnapshot(s: DrawSnapshot): DrawSnapshot {
  return {
    ...s,
    participants: [...s.participants].sort(byId),
    assignments: [...s.assignments].sort((a, b) => (a.giverId < b.giverId ? -1 : a.giverId > b.giverId ? 1 : 0)),
    rules: normaliseRules(s.rules),
  };
}

export function formatShortFingerprint(digestHex: string): string {
  const s = digestHex.slice(0, 12).toUpperCase();
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}

export async function computeDigest(snapshot: DrawSnapshot): Promise<string> {
  return sha256Hex(canonicalJson(normaliseSnapshot(snapshot)));
}

export async function computeIntegrity(snapshot: DrawSnapshot): Promise<DrawIntegrityRecord> {
  const digestHex = await computeDigest(snapshot);
  return {
    algorithm: 'SHA-256',
    canonicalisation: 'ss-canonical-json-v1',
    digestHex,
    shortFingerprint: formatShortFingerprint(digestHex),
    computedAt: nowIso(),
  };
}

/** Recompute and compare against the stored or a user-supplied fingerprint (full or short form). */
export async function verifyIntegrity(snapshot: DrawSnapshot, expected: string): Promise<boolean> {
  const digest = await computeDigest(snapshot);
  const clean = expected.trim().toLowerCase().replace(/[^0-9a-f]/g, '');
  if (clean.length === 64) return clean === digest;
  if (clean.length === 12) return digest.startsWith(clean);
  return false;
}
