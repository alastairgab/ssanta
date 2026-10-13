import { useMemo, useState } from 'react';
import { Icon } from '../../components/ui/icons';
import { Badge, Callout, Card, EmptyState, SectionTitle, Select, TextInput, useToast } from '../../components/ui/ui';
import { AssignmentTable } from '../../components/draws/AssignmentTable';
import { assignmentsCsv } from '../../services/csvImport';
import { verifyIntegrity, computeDigest } from '../../services/drawIntegrity';
import { compareAssignments, DRAW_STATUS_LABELS, sharedCount } from '../../services/drawVersions';
import type { DrawVersion } from '../../types/models';
import { downloadText, safeFilename } from '../../utils/download';
import { formatDateTime, plural } from '../../utils/format';
import type { EventCtx } from './EventWorkspace';

const REASON: Record<DrawVersion['reason'], string> = { initial: 'First draw', redraw: 'Redraw', 'withdrawal-repair': 'Withdrawal repair' };

export default function VersionsPage({ ctx }: { ctx: EventCtx }) {
  const { event, nameOf } = ctx;
  const versions = ctx.draws.filter((d) => d.status !== 'draft').sort((a, b) => b.version - a.version);
  const [a, setA] = useState<string>(versions[1]?.id ?? '');
  const [b, setB] = useState<string>(versions[0]?.id ?? '');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [check, setCheck] = useState('');
  const [checkResult, setCheckResult] = useState<string | null>(null);
  const toast = useToast();

  const comparison = useMemo(() => {
    const da = versions.find((v) => v.id === a);
    const db_ = versions.find((v) => v.id === b);
    if (!da || !db_ || da.id === db_.id) return null;
    return { da, db: db_, cmp: compareAssignments(da.snapshot.assignments, db_.snapshot.assignments) };
  }, [a, b, versions]);

  if (versions.length === 0) {
    return (
      <EmptyState title="No confirmed draws yet" icon={<Icon.Fingerprint />}>
        Every confirmed draw is stored here as a version with a fingerprint, so you have a clear record.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <SectionTitle
          title="Draw versions"
          description="Confirmed draws are never edited. A redraw or withdrawal creates a new version; older ones are kept as superseded so you can tell which links are out of date."
        />
        <ol className="space-y-3">
          {versions.map((v) => {
            const open = expanded === v.id;
            return (
              <li key={v.id} className="rounded-xl ring-1 ring-pine-200">
                <div className="flex flex-wrap items-center gap-3 p-4">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-pine-800 font-display text-lg font-semibold text-white">v{v.version}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">
                      {event.name} — Draw version {v.version}{' '}
                      <Badge tone={v.status === 'superseded' ? 'grey' : v.status === 'active' ? 'green' : 'blue'}>{DRAW_STATUS_LABELS[v.status]}</Badge>
                    </p>
                    <p className="text-xs text-pine-700">
                      {REASON[v.reason]} · created {formatDateTime(v.createdAt)} · confirmed {formatDateTime(v.confirmedAt)}
                      {v.supersededAt ? ` · superseded ${formatDateTime(v.supersededAt)}` : ''} · {plural(sharedCount(v), 'link')} marked shared
                    </p>
                    {v.note ? <p className="text-xs text-pine-700">Note: {v.note}</p> : null}
                    {v.removedParticipantIds?.length ? <p className="text-xs text-pine-700">Withdrawn: {v.removedParticipantIds.map(nameOf).join(', ')}</p> : null}
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-sm font-semibold tracking-wider">{v.integrity?.shortFingerprint}</p>
                    <button type="button" className="text-xs font-semibold text-berry-700 hover:underline" onClick={() => setExpanded(open ? null : v.id)} aria-expanded={open}>
                      {open ? 'Hide details' : 'Details'}
                    </button>
                  </div>
                </div>
                {open ? (
                  <div className="space-y-4 border-t border-pine-100 p-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-pine-600">Full SHA-256 fingerprint</p>
                      <p className="break-all font-mono text-xs">{v.integrity?.digestHex}</p>
                    </div>
                    <AssignmentTable assignments={v.snapshot.assignments} nameOf={nameOf} concealed={event.concealAssignments} />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        onClick={async () => {
                          const ok = (await computeDigest(v.snapshot)) === v.integrity?.digestHex;
                          toast(ok ? 'Fingerprint matches — this version is unchanged.' : 'Fingerprint MISMATCH — this record has been altered.', ok ? 'success' : 'error');
                        }}
                      >
                        <Icon.Fingerprint className="h-4 w-4" /> Re-check fingerprint
                      </button>
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        onClick={() => downloadText(assignmentsCsv(v, nameOf), `${safeFilename(event.name)}-assignments-v${v.version}.csv`, 'text/csv;charset=utf-8')}
                      >
                        <Icon.Save className="h-4 w-4" /> Export assignments CSV
                      </button>
                    </div>
                    <p className="text-xs text-pine-600">
                      Solver: {v.snapshot.solver.method}, {v.snapshot.solver.provenOptimal ? 'proven optimal' : 'stopped at time limit'}, {v.snapshot.solver.repeatCount} repeats, {v.snapshot.solver.elapsedMs} ms.
                    </p>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      </Card>

      {versions.length > 1 ? (
        <Card>
          <SectionTitle title="Compare versions" description="Shows exactly whose recipient changed between two versions." />
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label="From" value={a} onChange={(e) => setA(e.target.value)}>
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  Version {v.version}
                </option>
              ))}
            </Select>
            <Select label="To" value={b} onChange={(e) => setB(e.target.value)}>
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  Version {v.version}
                </option>
              ))}
            </Select>
          </div>
          {comparison ? (
            <div className="mt-4">
              {event.concealAssignments ? (
                <Callout className="mb-3">Names are visible below because comparing requires them. Turn off “Hide who is buying for whom” on the Draw page to stop this notice.</Callout>
              ) : null}
              <p className="mb-2 text-sm font-medium">
                {plural(comparison.cmp.changed.length, 'change')}, {comparison.cmp.unchanged.length} unchanged
              </p>
              <ul className="space-y-1 text-sm">
                {comparison.cmp.changed.map((c) => (
                  <li key={c.giverId} className="rounded-lg bg-gold-100 px-3 py-2">
                    <strong>{nameOf(c.giverId)}</strong>: {c.from ? nameOf(c.from) : '(not in this version)'} → {c.to ? nameOf(c.to) : '(withdrawn)'}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-3 text-sm text-pine-700">Choose two different versions.</p>
          )}
        </Card>
      ) : null}

      <Card>
        <SectionTitle title="Verify a fingerprint" description="Paste a fingerprint you recorded earlier (short or full) to check whether the current version still matches it." />
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const target = versions[0]!;
            const matches = [];
            for (const v of versions) if (await verifyIntegrity(v.snapshot, check)) matches.push(v.version);
            setCheckResult(
              matches.length
                ? `Matches draw version ${matches.join(', ')}.${matches.includes(target.version) ? '' : ` (Not the latest version, v${target.version}.)`}`
                : 'No version matches that fingerprint.',
            );
          }}
        >
          <div className="min-w-[16rem] flex-1">
            <TextInput label="Fingerprint" value={check} onChange={(e) => setCheck(e.target.value)} placeholder="8A73-C21D-9F44" />
          </div>
          <button type="submit" className="btn-pine">
            Check
          </button>
        </form>
        {checkResult ? <p className="mt-3 text-sm font-medium" aria-live="polite">{checkResult}</p> : null}
        <p className="mt-3 text-xs text-pine-600">
          A fingerprint is a SHA-256 hash of the frozen draw. It shows whether a draw changed compared with a fingerprint you trust, but it’s not a signature: it doesn’t prove who made or approved the draw.
        </p>
      </Card>
    </div>
  );
}
