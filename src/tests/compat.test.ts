// @vitest-environment node
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { openRevealUrl } from '../services/revealLinks';
import { decryptBackup, importBackup, parseBackupFile } from '../services/backups';
import { computeDigest } from '../services/drawIntegrity';
import { db, SantaDB, useDatabase } from '../services/storage';

/**
 * Backward-compatibility fixtures, generated once by schema/link format v1 and frozen in the repo.
 * Future releases must keep these passing: old links must open, old backups must restore,
 * and stored draw fingerprints must still verify (canonicalisation must not change).
 */
const fixture = (name: string) => readFileSync(new URL(`./compat/${name}`, import.meta.url), 'utf8');

describe('backward compatibility (format v1)', () => {
  it('opens a link created by format v1', async () => {
    const p = await openRevealUrl(fixture('link-v1.txt').trim());
    expect(p).toMatchObject({ v: 1, g: 'Simba', r: 'Nala', gc: 'Agent Snowflake', dv: 1, th: 'classic', bud: 50 });
  });

  it('restores a v1 plain backup and its fingerprints still verify', async () => {
    useDatabase(new SantaDB(`compat-${Date.now()}`));
    const parsed = parseBackupFile(fixture('backup-v1.json'));
    expect(parsed.kind).toBe('plain');
    if (parsed.kind !== 'plain') return;
    await importBackup(parsed.backup, 'replace');
    const draws = await db.draws.toArray();
    expect(draws).toHaveLength(1);
    expect(await computeDigest(draws[0]!.snapshot)).toBe(draws[0]!.integrity!.digestHex);
    expect(await db.participants.count()).toBe(4);
  });

  it('decrypts a v1 encrypted backup', async () => {
    const parsed = parseBackupFile(fixture('backup-v1-encrypted.json'));
    expect(parsed.kind).toBe('encrypted');
    if (parsed.kind !== 'encrypted') return;
    const plain = await decryptBackup(parsed.backup, 'fixture-password');
    expect(plain.data.events[0]!.name).toBe('Family Christmas 2025');
  });
});
