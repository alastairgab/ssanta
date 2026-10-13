import { useEffect, useState } from 'react';
import { Icon } from '../components/ui/icons';
import { Badge, Callout, Card, ConfirmDialog, PageHeader, SectionTitle, TextInput, Toggle, useAsyncAction, useToast } from '../components/ui/ui';
import {
  backupFilename,
  buildPlainBackup,
  decryptBackup,
  encryptBackup,
  importBackup,
  parseBackupFile,
  readWorkspace,
  type ImportSummary,
} from '../services/backups';
import { requestPersistentStorage } from '../services/storage';
import type { PlainBackup } from '../types/models';
import { downloadText } from '../utils/download';
import { formatDateTime } from '../utils/format';

export default function BackupPage() {
  const toast = useToast();
  const { busy, run } = useAsyncAction();
  const [includeAssignments, setIncludeAssignments] = useState(true);
  const [encrypt, setEncrypt] = useState(true);
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<{ kind: 'plain'; backup: PlainBackup } | { kind: 'encrypted'; raw: ReturnType<typeof parseBackupFile> } | null>(null);
  const [importPassword, setImportPassword] = useState('');
  const [mode, setMode] = useState<'merge' | 'replace' | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);

  useEffect(() => {
    void navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));
  }, []);

  const doExport = () =>
    run(async () => {
      if (encrypt) {
        if (password.length < 8) return setPwError('Use at least 8 characters.');
        if (password !== password2) return setPwError('The passwords don’t match.');
      }
      setPwError(null);
      const plain = buildPlainBackup(await readWorkspace(), includeAssignments);
      const out = encrypt ? await encryptBackup(plain, password) : plain;
      downloadText(JSON.stringify(out, null, encrypt ? 0 : 2), backupFilename(encrypt, includeAssignments), 'application/json');
      setPassword('');
      setPassword2('');
      toast('Backup downloaded');
    });

  const plainLoaded = loaded?.kind === 'plain' ? loaded.backup : null;

  return (
    <>
      <PageHeader title="Backups & imports" subtitle="Your workspace lives only in this browser. Back it up regularly, and use a backup to move to another device." />
      {persisted === false ? (
        <Callout tone="warning" className="mb-6" title="This browser may clear your data when storage is low">
          <p>
            Ask the browser to keep it:{' '}
            <button type="button" className="font-semibold underline" onClick={async () => setPersisted(await requestPersistentStorage())}>
              Request persistent storage
            </button>
            . Either way, keep a backup.
          </p>
        </Callout>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle title="Export a backup" />
          <div className="space-y-4">
            <Toggle
              checked={includeAssignments}
              onChange={setIncludeAssignments}
              label="Include draws and history (sensitive)"
              description="Needed to fully restore your workspace. Anyone who opens an unencrypted file with this switched on can see who is buying for whom. Switch off for a “setup only” copy (people, groups, rules)."
            />
            <Toggle checked={encrypt} onChange={setEncrypt} label="Protect with a password" description="AES-256 encryption. Without the password the file can't be opened — not even by this app — so don't lose it." />
            {encrypt ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <TextInput label="Password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} error={pwError} />
                <TextInput label="Repeat password" type="password" autoComplete="new-password" value={password2} onChange={(e) => setPassword2(e.target.value)} />
              </div>
            ) : includeAssignments ? (
              <Callout tone="warning">This file will contain readable assignments. Store it somewhere private.</Callout>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={encrypt ? 'green' : 'gold'}>{encrypt ? 'Encrypted' : 'Plain text'}</Badge>
              <Badge tone={includeAssignments ? 'red' : 'neutral'}>{includeAssignments ? 'Contains assignments' : 'Setup only'}</Badge>
            </div>
            <button type="button" className="btn-primary" disabled={busy} onClick={() => void doExport()}>
              <Icon.Save className="h-4 w-4" /> {busy ? 'Preparing…' : 'Download backup'}
            </button>
          </div>
        </Card>

        <Card>
          <SectionTitle title="Restore or import" description="The file is checked thoroughly before anything changes." />
          <label className="btn-secondary cursor-pointer">
            <Icon.Upload className="h-4 w-4" /> Choose backup file
            <input
              type="file"
              accept=".json,application/json"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                setSummary(null);
                if (!f) return;
                try {
                  if (f.size > 50 * 1024 * 1024) throw new Error('That file is too large to be a Secret Santa backup.');
                  const parsed = parseBackupFile(await f.text());
                  setLoaded(parsed.kind === 'plain' ? { kind: 'plain', backup: parsed.backup } : { kind: 'encrypted', raw: parsed });
                } catch (err) {
                  setLoaded(null);
                  toast(err instanceof Error ? err.message : 'Could not read that file.', 'error');
                }
              }}
            />
          </label>
          {loaded?.kind === 'encrypted' ? (
            <form
              className="mt-4 space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                const raw = loaded.raw;
                if (raw.kind !== 'encrypted') return;
                const b = await run(() => decryptBackup(raw.backup, importPassword));
                if (b) {
                  setLoaded({ kind: 'plain', backup: b });
                  setImportPassword('');
                }
              }}
            >
              <Callout title="This backup is password-protected" />
              <TextInput label="Backup password" type="password" autoComplete="current-password" value={importPassword} onChange={(e) => setImportPassword(e.target.value)} />
              <button type="submit" className="btn-pine" disabled={busy || !importPassword}>
                {busy ? 'Unlocking…' : 'Unlock'}
              </button>
            </form>
          ) : null}
          {plainLoaded ? (
            <div className="mt-4 space-y-3">
              <div className="rounded-xl bg-pine-50 p-4 text-sm">
                <p className="font-semibold">Backup from {formatDateTime(plainLoaded.manifest.exportedAt)}</p>
                <p className="text-pine-700">
                  {plainLoaded.data.events.length} exchanges · {plainLoaded.data.participants.length} people · {plainLoaded.data.draws.length} draw versions · {plainLoaded.data.history.length} history records
                </p>
                <p className="mt-1">{plainLoaded.manifest.containsAssignments ? <Badge tone="red">Contains assignments</Badge> : <Badge>Setup only</Badge>}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-primary" onClick={() => setMode('merge')}>
                  Add to my workspace
                </button>
                <button type="button" className="btn-danger" onClick={() => setMode('replace')}>
                  Replace my workspace…
                </button>
              </div>
              <p className="hint">“Add” keeps everything you have and only adds records that are new. Existing records are never overwritten.</p>
            </div>
          ) : null}
          {summary ? (
            <Callout tone="success" className="mt-4" title="Import complete">
              Added {Object.values(summary.added).reduce((a, b) => a + b, 0)} records
              {Object.values(summary.conflicts).reduce((a, b) => a + b, 0) > 0
                ? `; ${Object.values(summary.conflicts).reduce((a, b) => a + b, 0)} records already existed with different content and were left unchanged`
                : ''}
              .
            </Callout>
          ) : null}
        </Card>
      </div>
      <ConfirmDialog
        open={mode !== null}
        title={mode === 'replace' ? 'Replace your whole workspace?' : 'Add this backup to your workspace?'}
        danger={mode === 'replace'}
        requireText={mode === 'replace' ? 'REPLACE' : undefined}
        confirmLabel={mode === 'replace' ? 'Replace everything' : 'Import'}
        busy={busy}
        onCancel={() => setMode(null)}
        onConfirm={async () => {
          if (!plainLoaded || !mode) return;
          const s = await run(() => importBackup(plainLoaded, mode));
          setMode(null);
          if (s) {
            setSummary(s);
            setLoaded(null);
          }
        }}
      >
        {mode === 'replace' ? (
          <p className="font-semibold text-berry-800">Everything currently in this browser — every exchange, draw and history record — will be deleted and replaced by the backup. Export a backup of the current workspace first if you might need it.</p>
        ) : (
          <p>New records from the backup are added. Nothing you already have will be changed or removed.</p>
        )}
      </ConfirmDialog>
    </>
  );
}
