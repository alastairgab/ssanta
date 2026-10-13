import type { BackupManifest, EncryptedBackup, PlainBackup, WorkspaceData } from '../types/models';
import { CURRENT_SCHEMA_VERSION } from '../types/models';
import { utf8 } from '../utils/base64';
import { nowIso } from '../utils/id';
import { CryptoError, passwordDecrypt, passwordEncrypt, PBKDF2_ITERATIONS } from './cryptography';
import { manifestSchema, workspaceDataSchema } from './schemas';
import { ALL_TABLES, db } from './storage';
import { canonicalJson } from '../utils/canonicalJson';

export const APP_VERSION = '2.0.0';

/**
 * Backups
 *  - Plain JSON: readable by anyone who has the file. Contains assignments unless the organiser
 *    chooses the "setup only" option.
 *  - Encrypted JSON: same content, AES-256-GCM encrypted with a key derived from a password
 *    (PBKDF2-SHA-256, 600 000 iterations). The manifest stays readable so the app can show what
 *    the file is, but contains no names or assignments.
 *
 * Import always validates the file against strict schemas, migrates older schema versions and
 * never overwrites data without explicit confirmation ("replace") — "merge" only adds records
 * whose IDs don't exist yet.
 */

export class BackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupError';
  }
}

export async function readWorkspace(): Promise<WorkspaceData> {
  const [series, events, participants, relationships, households, history, draws, wishlists, questions, replies, settings] = await Promise.all([
    db.series.toArray(),
    db.events.toArray(),
    db.participants.toArray(),
    db.relationships.toArray(),
    db.households.toArray(),
    db.history.toArray(),
    db.draws.toArray(),
    db.wishlists.toArray(),
    db.questions.toArray(),
    db.replies.toArray(),
    db.settings.toArray(),
  ]);
  return { series, events, participants, relationships, households, history, draws, wishlists, questions, replies, settings };
}

function countsOf(data: WorkspaceData): Record<string, number> {
  return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, (v as unknown[]).length]));
}

/** Remove assignment-revealing data for a "setup only" export. */
export function stripAssignments(data: WorkspaceData): WorkspaceData {
  return {
    ...data,
    events: data.events.map((e) => {
      const { draftDrawId: _d, activeDrawId: _a, relayKeys: _r, ...rest } = e;
      void _d;
      void _a;
      void _r;
      return { ...rest, status: e.status === 'archived' ? 'archived' : 'draft' };
    }),
    history: [],
    draws: [],
    questions: [],
    replies: [],
  };
}

export function buildPlainBackup(data: WorkspaceData, includeAssignments: boolean): PlainBackup {
  const content = includeAssignments ? data : stripAssignments(data);
  const manifest: BackupManifest = {
    format: 'secret-santa-backup',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    appVersion: APP_VERSION,
    exportedAt: nowIso(),
    containsAssignments: includeAssignments && (content.draws.length > 0 || content.history.length > 0),
    encrypted: false,
    counts: countsOf(content),
  };
  return { manifest, data: content };
}

export async function encryptBackup(plain: PlainBackup, password: string, iterations = PBKDF2_ITERATIONS): Promise<EncryptedBackup> {
  if (password.length < 8) throw new BackupError('Use a password of at least 8 characters.');
  const enc = await passwordEncrypt(password, utf8.encode(JSON.stringify(plain)), iterations);
  return {
    manifest: { ...plain.manifest, encrypted: true },
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: enc.iterations, saltB64: enc.saltB64 },
    cipher: { name: 'AES-GCM', ivB64: enc.ivB64 },
    ciphertextB64: enc.ciphertextB64,
  };
}

export type ParsedBackupFile = { kind: 'plain'; backup: PlainBackup } | { kind: 'encrypted'; backup: EncryptedBackup };

export function parseBackupFile(text: string): ParsedBackupFile {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new BackupError('This file is not a valid backup (it is not JSON).');
  }
  if (!json || typeof json !== 'object') throw new BackupError('This file is not a Secret Santa backup.');
  const obj = json as Record<string, unknown>;
  const manifest = manifestSchema.safeParse(obj.manifest);
  if (!manifest.success) throw new BackupError('This file is not a Secret Santa backup (missing or invalid manifest).');
  if (manifest.data.schemaVersion > CURRENT_SCHEMA_VERSION) {
    throw new BackupError('This backup was created by a newer version of the app. Please update the app before importing it.');
  }
  if (manifest.data.encrypted) {
    const kdf = obj.kdf as EncryptedBackup['kdf'] | undefined;
    const cipher = obj.cipher as EncryptedBackup['cipher'] | undefined;
    if (!kdf || kdf.name !== 'PBKDF2' || typeof kdf.saltB64 !== 'string' || !cipher || typeof cipher.ivB64 !== 'string' || typeof obj.ciphertextB64 !== 'string') {
      throw new BackupError('This encrypted backup is damaged.');
    }
    return { kind: 'encrypted', backup: { manifest: manifest.data as BackupManifest, kdf, cipher, ciphertextB64: obj.ciphertextB64 } };
  }
  return { kind: 'plain', backup: validatePlainBackup(obj) };
}

export async function decryptBackup(enc: EncryptedBackup, password: string): Promise<PlainBackup> {
  let bytes: Uint8Array;
  try {
    bytes = await passwordDecrypt(password, { saltB64: enc.kdf.saltB64, ivB64: enc.cipher.ivB64, ciphertextB64: enc.ciphertextB64, iterations: enc.kdf.iterations });
  } catch (e) {
    if (e instanceof CryptoError) throw new BackupError(e.message);
    throw new BackupError('The backup could not be decrypted.');
  }
  let json: unknown;
  try {
    json = JSON.parse(utf8.decode(bytes));
  } catch {
    throw new BackupError('The decrypted backup is damaged.');
  }
  return validatePlainBackup(json as Record<string, unknown>);
}

/** Schema migrations, keyed by the version they upgrade FROM. */
const MIGRATIONS: Record<number, (data: Record<string, unknown>) => Record<string, unknown>> = {
  // 1 → 2 will be added here when the schema changes. Migrations must preserve history and draws.
};

export function migrateData(data: Record<string, unknown>, fromVersion: number): Record<string, unknown> {
  let current = data;
  for (let v = fromVersion; v < CURRENT_SCHEMA_VERSION; v++) {
    const m = MIGRATIONS[v];
    if (!m) throw new BackupError(`No migration available from schema version ${v}.`);
    current = m(current);
  }
  return current;
}

function validatePlainBackup(obj: Record<string, unknown>): PlainBackup {
  const manifest = manifestSchema.safeParse(obj.manifest);
  if (!manifest.success) throw new BackupError('The backup manifest is invalid.');
  const migrated = migrateData((obj.data ?? {}) as Record<string, unknown>, manifest.data.schemaVersion);
  const parsed = workspaceDataSchema.safeParse(migrated);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new BackupError(`The backup contains invalid data${first ? ` (at ${first.path.join('.')}: ${first.message})` : ''}.`);
  }
  const data = parsed.data as unknown as WorkspaceData;
  checkReferentialIntegrity(data);
  return { manifest: { ...(manifest.data as BackupManifest), encrypted: false }, data };
}

function checkReferentialIntegrity(data: WorkspaceData) {
  const people = new Set(data.participants.map((p) => p.id));
  const series = new Set(data.series.map((s) => s.id));
  for (const e of data.events) {
    if (!series.has(e.seriesId)) throw new BackupError(`Event "${e.name}" refers to a missing series.`);
  }
  for (const h of data.history) {
    if (!people.has(h.giverId) || !people.has(h.recipientId)) throw new BackupError('A history record refers to a missing participant.');
  }
  const ids = new Set<string>();
  for (const key of ALL_TABLES) {
    if (key === 'settings') continue;
    for (const row of data[key] as { id: string }[]) {
      const k = `${key}:${row.id}`;
      if (ids.has(k)) throw new BackupError(`The backup contains duplicate ${key} records.`);
      ids.add(k);
    }
  }
}

export interface ImportSummary {
  added: Record<string, number>;
  skipped: Record<string, number>;
  conflicts: Record<string, number>;
}

/**
 * Apply a validated backup.
 *  - replace: clears the whole workspace then loads the backup (caller must confirm first).
 *  - merge: adds records whose IDs are new; identical records are skipped; differing records with
 *    the same ID are left untouched and counted as conflicts (existing data always wins).
 */
export async function importBackup(backup: PlainBackup, mode: 'replace' | 'merge'): Promise<ImportSummary> {
  const summary: ImportSummary = { added: {}, skipped: {}, conflicts: {} };
  const tables = ALL_TABLES.map((t) => db.table(t));
  await db.transaction('rw', tables, async () => {
    if (mode === 'replace') {
      for (const t of tables) await t.clear();
    }
    for (const name of ALL_TABLES) {
      const rows = backup.data[name] as unknown as Record<string, unknown>[];
      const table = db.table(name);
      const keyName = name === 'settings' ? 'key' : 'id';
      let added = 0;
      let skipped = 0;
      let conflicts = 0;
      for (const row of rows) {
        const key = row[keyName] as string;
        const existing = mode === 'merge' ? await table.get(key) : undefined;
        if (!existing) {
          await table.add(row);
          added++;
        } else if (canonicalJson(existing) === canonicalJson(row)) {
          skipped++;
        } else {
          conflicts++;
        }
      }
      summary.added[name] = added;
      summary.skipped[name] = skipped;
      summary.conflicts[name] = conflicts;
    }
  });
  return summary;
}

export function backupFilename(encrypted: boolean, includeAssignments: boolean): string {
  const date = new Date().toISOString().slice(0, 10);
  return `secret-santa-backup-${date}${includeAssignments ? '' : '-setup-only'}${encrypted ? '-encrypted' : ''}.json`;
}
