import { useMemo, useState } from 'react';
import { Icon } from '../components/ui/icons';
import { Badge, Callout, Card, EmptyState, Modal, PageHeader, SectionTitle, Select, TextInput, useToast } from '../components/ui/ui';
import { PairingHeatmap } from '../components/history/PairingHeatmap';
import { useHistoryEntries, useManualHistory, useParticipants, useSeriesList } from '../hooks/useData';
import { historyCsv, namesNeedingResolution, parseHistoryCsv, resolveName, type HistoryImportRow } from '../services/csvImport';
import { fairnessSummary } from '../services/historicalFairness';
import { addHistoryRecords, createParticipant, db } from '../services/storage';
import type { ID } from '../types/models';
import { downloadText } from '../utils/download';
import { participantLabel } from '../utils/format';

interface ImportState {
  seriesId: ID;
  rows: HistoryImportRow[];
  /** name → participant id | 'new' | 'skip' */
  mapping: Record<string, string>;
  unresolved: { name: string; candidates: ID[] }[];
}

export default function HistoryPage() {
  const series = useSeriesList();
  const people = useParticipants();
  const manual = useManualHistory();
  const all = useHistoryEntries();
  const toast = useToast();
  const [seriesId, setSeriesId] = useState<string>('');
  const [form, setForm] = useState({ year: new Date().getFullYear() - 1, giver: '', recipient: '' });
  const [formError, setFormError] = useState<string | null>(null);
  const [importState, setImportState] = useState<ImportState | null>(null);

  const map = useMemo(() => new Map((people ?? []).map((p) => [p.id, p])), [people]);
  const nameOf = (id: ID) => participantLabel(map.get(id));
  const activeSeries = seriesId || series?.[0]?.id || '';
  const entries = useMemo(() => (all ?? []).filter((e) => e.seriesId === activeSeries), [all, activeSeries]);
  const years = Array.from(new Set(entries.map((e) => e.year))).sort((a, b) => b - a);
  const ids = Array.from(new Set(entries.flatMap((e) => [e.giverId, e.recipientId]))).sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  const fairness = fairnessSummary(entries, ids);

  if (!series || !people || !manual || !all) return null;
  if (series.length === 0) {
    return (
      <>
        <PageHeader title="Exchange history" />
        <EmptyState title="No exchanges yet" icon={<Icon.History />}>
          Create an exchange first; then you can add earlier years here so repeats are avoided.
        </EmptyState>
      </>
    );
  }
  const seriesName = (id: ID) => series.find((s) => s.id === id)?.name ?? '';
  const sorted = [...people].filter((p) => p.active).sort((a, b) => a.displayName.localeCompare(b.displayName));

  const startImport = async (file: File) => {
    try {
      const rows = parseHistoryCsv(await file.text());
      if (rows.length === 0) return toast('No rows found in that file.', 'error');
      const unresolved = namesNeedingResolution(rows, people).map((u) => ({ name: u.name, candidates: u.resolution.status === 'ambiguous' ? u.resolution.candidates : [] }));
      const mapping: Record<string, string> = {};
      for (const u of unresolved) mapping[u.name] = u.candidates.length ? '' : 'new';
      setImportState({ seriesId: activeSeries, rows, mapping, unresolved });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not read that file.', 'error');
    }
  };

  const applyImport = async () => {
    if (!importState) return;
    const ids: Record<string, string> = {};
    for (const [name, target] of Object.entries(importState.mapping)) {
      if (target === 'new') ids[name] = (await createParticipant({ displayName: name, active: false })).id;
      else if (target && target !== 'skip') ids[name] = target;
    }
    const resolve = (name: string) => {
      if (name in ids) return ids[name];
      const r = resolveName(name, people);
      return r.status === 'matched' ? r.id : undefined;
    };
    const records = [];
    let skipped = 0;
    for (const row of importState.rows) {
      const g = resolve(row.giverName);
      const r = resolve(row.recipientName);
      if (row.year === null || !g || !r || g === r) {
        skipped++;
        continue;
      }
      records.push({ seriesId: importState.seriesId, year: row.year, giverId: g, recipientId: r, source: 'import' as const });
    }
    await addHistoryRecords(records);
    setImportState(null);
    toast(`${records.length} history records imported${skipped ? `, ${skipped} rows skipped` : ''}`);
  };

  const invalidRows = importState?.rows.filter((r) => r.year === null || !r.giverName || !r.recipientName) ?? [];

  return (
    <>
      <PageHeader
        title="Exchange history"
        subtitle="Past assignments help the draw avoid repeats. Confirmed draws are added automatically; add older years by hand or from a CSV."
        action={
          <>
            <label className="btn-secondary btn-sm cursor-pointer">
              <Icon.Upload className="h-4 w-4" /> Import CSV
              <input
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void startImport(f);
                }}
              />
            </label>
            <button type="button" className="btn-secondary btn-sm" onClick={() => downloadText(historyCsv(entries, nameOf, seriesName), 'secret-santa-history.csv', 'text/csv;charset=utf-8')}>
              <Icon.Save className="h-4 w-4" /> Export CSV
            </button>
          </>
        }
      />
      <div className="mb-6 max-w-sm">
        <Select label="Series" value={activeSeries} onChange={(e) => setSeriesId(e.target.value)}>
          {series.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Card>
          <SectionTitle title="By year" />
          {years.length === 0 ? (
            <EmptyState title="No history yet" icon={<Icon.History />}>
              Add last year’s pairs below so this year’s draw can avoid repeating them.
            </EmptyState>
          ) : (
            <div className="space-y-5">
              {years.map((y) => {
                const yEntries = entries.filter((e) => e.year === y).sort((a, b) => nameOf(a.giverId).localeCompare(nameOf(b.giverId)));
                return (
                  <section key={y}>
                    <h3 className="mb-2 font-display text-lg font-semibold">
                      {y} <span className="text-sm font-normal text-pine-600">· {yEntries.length} pairings</span>
                    </h3>
                    <ul className="divide-y divide-pine-100 rounded-xl ring-1 ring-pine-100">
                      {yEntries.map((e, i) => {
                        const rec = manual.find((m) => m.seriesId === e.seriesId && m.year === e.year && m.giverId === e.giverId && m.recipientId === e.recipientId);
                        return (
                          <li key={i} className="flex items-center gap-2 px-3 py-2 text-sm">
                            <span className="flex-1">
                              {nameOf(e.giverId)} → {nameOf(e.recipientId)}
                            </span>
                            <Badge tone={e.source === 'draw' ? 'green' : 'neutral'}>{e.source === 'draw' ? 'Confirmed draw' : e.source === 'import' ? 'Imported' : 'Manual'}</Badge>
                            {rec ? (
                              <button type="button" className="btn-ghost btn-sm text-berry-700" aria-label="Delete record" onClick={() => void db.history.delete(rec.id)}>
                                <Icon.Trash className="h-4 w-4" />
                              </button>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}
        </Card>
        <div className="space-y-6">
          <Card>
            <SectionTitle title="Add a past pairing" />
            <form
              className="space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!form.giver || !form.recipient || form.giver === form.recipient) return setFormError('Choose two different people.');
                if (!Number.isInteger(form.year) || form.year < 1900) return setFormError('Enter a valid year.');
                setFormError(null);
                await addHistoryRecords([{ seriesId: activeSeries, year: form.year, giverId: form.giver, recipientId: form.recipient, source: 'manual' }]);
                setForm({ ...form, giver: '', recipient: '' });
                toast('Added');
              }}
            >
              <TextInput label="Year" type="number" value={form.year} onChange={(e) => setForm({ ...form, year: Number(e.target.value) })} />
              <Select label="Giver" value={form.giver} onChange={(e) => setForm({ ...form, giver: e.target.value })}>
                <option value="">Choose…</option>
                {sorted.map((p) => (
                  <option key={p.id} value={p.id}>
                    {participantLabel(p)}
                  </option>
                ))}
              </Select>
              <Select label="Bought for" value={form.recipient} onChange={(e) => setForm({ ...form, recipient: e.target.value })}>
                <option value="">Choose…</option>
                {sorted.map((p) => (
                  <option key={p.id} value={p.id}>
                    {participantLabel(p)}
                  </option>
                ))}
              </Select>
              {formError ? (
                <p role="alert" className="text-sm font-medium text-berry-700">
                  {formError}
                </p>
              ) : null}
              <button type="submit" className="btn-primary w-full">
                Add to {seriesName(activeSeries)}
              </button>
            </form>
            <p className="hint mt-3">CSV format: columns <code>year, giver, recipient</code>.</p>
          </Card>
          <Card>
            <SectionTitle title="Fairness by person" description="How varied each person’s recipients have been." />
            {fairness.length === 0 ? (
              <p className="text-sm text-pine-700">No data yet.</p>
            ) : (
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Person</th>
                    <th>Years</th>
                    <th>Different recipients</th>
                    <th>Repeats</th>
                  </tr>
                </thead>
                <tbody>
                  {fairness
                    .filter((f) => f.years > 0)
                    .map((f) => (
                      <tr key={f.id}>
                        <td className="font-medium">{nameOf(f.id)}</td>
                        <td>{f.years}</td>
                        <td>{f.distinctRecipients}</td>
                        <td>{f.repeats > 0 ? <Badge tone="gold">{f.repeats}</Badge> : '0'}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      </div>

      {entries.length > 0 ? (
        <Card className="mt-6">
          <SectionTitle title="Pairing heatmap" description="How many times each giver has bought for each recipient in this series. Darker means more often." />
          <PairingHeatmap entries={entries} ids={ids} nameOf={nameOf} />
          <div className="mt-4 flex flex-wrap gap-4 text-sm text-pine-700">
            {years.map((y) => (
              <span key={y}>
                <strong>{y}</strong>: {new Set(entries.filter((e) => e.year === y).map((e) => e.giverId)).size} participants
              </span>
            ))}
          </div>
        </Card>
      ) : null}

      <Modal
        open={importState !== null}
        onClose={() => setImportState(null)}
        title={`Import ${importState?.rows.length ?? 0} rows into ${seriesName(importState?.seriesId ?? '')}`}
        size="lg"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setImportState(null)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" disabled={importState ? Object.values(importState.mapping).some((v) => v === '') : true} onClick={() => void applyImport()}>
              Import
            </button>
          </>
        }
      >
        {importState ? (
          <div className="space-y-4">
            {invalidRows.length > 0 ? (
              <Callout tone="warning" title={`${invalidRows.length} row(s) will be skipped`}>
                Rows {invalidRows.map((r) => r.line).join(', ')} are missing a valid year, giver or recipient.
              </Callout>
            ) : null}
            {importState.unresolved.length === 0 ? (
              <p className="text-sm">All names match people you already have.</p>
            ) : (
              <>
                <p className="text-sm text-pine-700">These names need your help — the app never guesses between people with the same name.</p>
                <ul className="space-y-3">
                  {importState.unresolved.map((u) => (
                    <li key={u.name}>
                      <Select
                        label={`“${u.name}” ${u.candidates.length ? `matches ${u.candidates.length} people` : 'is new'}`}
                        value={importState.mapping[u.name]}
                        onChange={(e) => setImportState({ ...importState, mapping: { ...importState.mapping, [u.name]: e.target.value } })}
                      >
                        {u.candidates.length ? <option value="">Choose who this is…</option> : null}
                        {(u.candidates.length ? u.candidates.map((c) => map.get(c)!) : sorted).map((p) => (
                          <option key={p.id} value={p.id}>
                            {participantLabel(p)}
                          </option>
                        ))}
                        <option value="new">Create a new (inactive) person called “{u.name}”</option>
                        <option value="skip">Skip rows with this name</option>
                      </Select>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        ) : null}
      </Modal>
    </>
  );
}
