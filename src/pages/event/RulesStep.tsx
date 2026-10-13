import { useState } from 'react';
import { Icon } from '../../components/ui/icons';
import { Badge, Callout, Card, SectionTitle, Select, Spinner, TextInput, Toggle, useAsyncAction } from '../../components/ui/ui';
import { ConstraintMatrix } from '../../components/constraints/ConstraintMatrix';
import { DiagnosisPanel } from '../../components/constraints/DiagnosisPanel';
import { useConstraintModel } from '../../hooks/useConstraintModel';
import { useSeriesList } from '../../hooks/useData';
import { describeHistoryMode } from '../../services/historicalFairness';
import { diagnoseEvent } from '../../services/eventOps';
import type { Diagnosis } from '../../services/conflictAnalyzer';
import { updateRules } from '../../services/storage';
import type { HistoryMode } from '../../types/models';
import { newId } from '../../utils/id';
import type { EventCtx } from './EventWorkspace';

function PersonSelect({ label, value, onChange, ctx }: { label: string; value: string; onChange: (v: string) => void; ctx: EventCtx }) {
  return (
    <Select label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Choose…</option>
      {ctx.members.map((m) => (
        <option key={m.id} value={m.id}>
          {ctx.nameOf(m.id)}
        </option>
      ))}
    </Select>
  );
}

export default function RulesStep({ ctx }: { ctx: EventCtx }) {
  const { event, nameOf } = ctx;
  const rules = event.rules;
  const series = useSeriesList();
  const { model } = useConstraintModel(ctx);
  const [fg, setFg] = useState('');
  const [fr, setFr] = useState('');
  const [xg, setXg] = useState('');
  const [xr, setXr] = useState('');
  const [xMutual, setXMutual] = useState(true);
  const [err, setErr] = useState<{ forced?: string; forbidden?: string }>({});
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const { busy, run } = useAsyncAction();

  const addForced = async () => {
    if (!fg || !fr) return setErr({ forced: 'Choose both people.' });
    if (fg === fr) return setErr({ forced: 'Someone can’t be forced to buy for themselves.' });
    setErr({});
    await updateRules(event.id, (r) => ({ ...r, forced: [...r.forced, { id: newId('fo'), giverId: fg, recipientId: fr, enabled: true }] }));
    setFg('');
    setFr('');
    setDiagnosis(null);
  };
  const addForbidden = async () => {
    if (!xg || !xr) return setErr({ forbidden: 'Choose both people.' });
    if (xg === xr) return setErr({ forbidden: 'Nobody can buy for themselves anyway.' });
    setErr({});
    await updateRules(event.id, (r) => ({ ...r, forbidden: [...r.forbidden, { id: newId('fb'), giverId: xg, recipientId: xr, mutual: xMutual, enabled: true }] }));
    setXg('');
    setXr('');
    setDiagnosis(null);
  };

  const issues = model?.issues ?? [];
  const memberSet = new Set(event.participantIds);

  return (
    <div className="space-y-6">
      {issues.length > 0 ? (
        <Callout tone="danger" title="Some rules contradict each other">
          <ul className="list-disc pl-5">
            {issues.map((i, idx) => (
              <li key={idx}>{i.message}</li>
            ))}
          </ul>
        </Callout>
      ) : null}

      <Card>
        <SectionTitle title="Forced pairings" description="“Simba MUST buy for Nala.” Forced pairings are never broken; if they clash with another rule, you'll be asked to resolve it." />
        <form
          className="mb-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            void addForced();
          }}
        >
          <PersonSelect label="Giver" value={fg} onChange={setFg} ctx={ctx} />
          <PersonSelect label="must buy for" value={fr} onChange={setFr} ctx={ctx} />
          <button type="submit" className="btn-primary">
            <Icon.Star className="h-4 w-4" /> Add
          </button>
          {err.forced ? (
            <p role="alert" className="text-sm font-medium text-berry-700 sm:col-span-3">
              {err.forced}
            </p>
          ) : null}
        </form>
        {rules.forced.length === 0 ? (
          <p className="text-sm text-pine-700">No forced pairings.</p>
        ) : (
          <ul className="divide-y divide-pine-100">
            {rules.forced.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <Badge tone="gold">
                  <Icon.Star className="h-3 w-3" /> Forced
                </Badge>
                <span className={`flex-1 font-medium ${f.enabled ? '' : 'text-pine-400 line-through'}`}>
                  {nameOf(f.giverId)} → {nameOf(f.recipientId)}
                  {!memberSet.has(f.giverId) || !memberSet.has(f.recipientId) ? <span className="ml-2 text-xs text-berry-700">(not in this exchange)</span> : null}
                </span>
                <Toggle checked={f.enabled} onChange={(v) => void updateRules(event.id, (r) => ({ ...r, forced: r.forced.map((x) => (x.id === f.id ? { ...x, enabled: v } : x)) }))} label={<span className="sr-only">Enabled</span>} />
                <button type="button" className="btn-ghost btn-sm text-berry-700" aria-label="Delete forced pairing" onClick={() => void updateRules(event.id, (r) => ({ ...r, forced: r.forced.filter((x) => x.id !== f.id) }))}>
                  <Icon.Trash className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <SectionTitle title="Forbidden pairings" description="“Simba can't buy for Nala.” One-way rules still let Nala buy for Simba; “both ways” blocks both." />
        <form
          className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            void addForbidden();
          }}
        >
          <PersonSelect label="Person" value={xg} onChange={setXg} ctx={ctx} />
          <PersonSelect label="can't buy for" value={xr} onChange={setXr} ctx={ctx} />
          <Select label="Direction" value={xMutual ? 'mutual' : 'one'} onChange={(e) => setXMutual(e.target.value === 'mutual')}>
            <option value="mutual">Both ways (mutual)</option>
            <option value="one">One way only</option>
          </Select>
          <button type="submit" className="btn-primary">
            <Icon.Ban className="h-4 w-4" /> Add
          </button>
          {err.forbidden ? (
            <p role="alert" className="text-sm font-medium text-berry-700 sm:col-span-2 lg:col-span-4">
              {err.forbidden}
            </p>
          ) : null}
        </form>
        {rules.forbidden.length === 0 ? (
          <p className="text-sm text-pine-700">No forbidden pairings.</p>
        ) : (
          <ul className="divide-y divide-pine-100">
            {rules.forbidden.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <Badge tone="red">{f.mutual ? '⇄ Both ways' : '→ One way'}</Badge>
                <span className={`flex-1 font-medium ${f.enabled ? '' : 'text-pine-400 line-through'}`}>
                  {f.mutual ? `${nameOf(f.giverId)} and ${nameOf(f.recipientId)} can't buy for each other` : `${nameOf(f.giverId)} can't buy for ${nameOf(f.recipientId)}`}
                </span>
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  onClick={() => void updateRules(event.id, (r) => ({ ...r, forbidden: r.forbidden.map((x) => (x.id === f.id ? { ...x, mutual: !x.mutual } : x)) }))}
                >
                  Make {f.mutual ? 'one-way' : 'mutual'}
                </button>
                <Toggle checked={f.enabled} onChange={(v) => void updateRules(event.id, (r) => ({ ...r, forbidden: r.forbidden.map((x) => (x.id === f.id ? { ...x, enabled: v } : x)) }))} label={<span className="sr-only">Enabled</span>} />
                <button type="button" className="btn-ghost btn-sm text-berry-700" aria-label="Delete forbidden pairing" onClick={() => void updateRules(event.id, (r) => ({ ...r, forbidden: r.forbidden.filter((x) => x.id !== f.id) }))}>
                  <Icon.Trash className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <SectionTitle title="No direct swaps" />
        <Toggle
          checked={rules.preventReciprocal}
          onChange={(v) => void updateRules(event.id, (r) => ({ ...r, preventReciprocal: v }))}
          label="Don’t let two people draw each other"
          description="Stops A → B and B → A in the same year. Longer loops (A → B → C → A) are fine. With very small groups this can make a draw impossible — two people can never avoid it."
        />
      </Card>

      <Card>
        <SectionTitle title="Avoid repeats from previous years" description={describeHistoryMode(rules.history)} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Look back at"
            value={rules.history.mode}
            onChange={(e) => void updateRules(event.id, (r) => ({ ...r, history: { ...r.history, mode: e.target.value as HistoryMode } }))}
          >
            <option value="none">No history restrictions</option>
            <option value="last-1">The previous event year</option>
            <option value="last-2">The previous two event years</option>
            <option value="last-3">The previous three event years</option>
            <option value="all">All previous years</option>
            <option value="custom">A custom number of years…</option>
          </Select>
          {rules.history.mode === 'custom' ? (
            <TextInput
              label="Number of previous event years"
              type="number"
              min={1}
              max={50}
              value={rules.history.customYears ?? 4}
              onChange={(e) => void updateRules(event.id, (r) => ({ ...r, history: { ...r.history, customYears: Math.max(1, Math.min(50, Number(e.target.value) || 1)) } }))}
            />
          ) : null}
        </div>
        {rules.history.mode !== 'none' ? (
          <div className="mt-4 space-y-4">
            <fieldset>
              <legend className="label">How strict?</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {(['hard', 'soft'] as const).map((s) => (
                  <label key={s} className={`flex cursor-pointer gap-3 rounded-xl p-3 ring-2 ${rules.history.strength === s ? 'ring-pine-600' : 'ring-pine-100'}`}>
                    <input type="radio" name="strength" className="mt-1 accent-pine-700" checked={rules.history.strength === s} onChange={() => void updateRules(event.id, (r) => ({ ...r, history: { ...r.history, strength: s } }))} />
                    <span className="text-sm">
                      <span className="font-semibold">{s === 'hard' ? 'Never repeat' : 'Try to avoid repeats'}</span>
                      <span className="block text-pine-700">{s === 'hard' ? 'Repeats are not allowed. If that’s impossible, you’ll see why.' : 'Repeats are used only when unavoidable, preferring the oldest and least frequent ones.'}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="label">History from these series counts</legend>
              <div className="mt-2 flex flex-wrap gap-3">
                {(series ?? []).map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-5 w-5 accent-pine-700"
                      checked={rules.history.sourceSeriesIds.includes(s.id)}
                      onChange={(e) =>
                        void updateRules(event.id, (r) => ({
                          ...r,
                          history: {
                            ...r.history,
                            sourceSeriesIds: e.target.checked ? Array.from(new Set([...r.history.sourceSeriesIds, s.id])) : r.history.sourceSeriesIds.filter((x) => x !== s.id),
                          },
                        }))
                      }
                    />
                    {s.name}
                    {s.id === event.seriesId ? <span className="text-xs text-pine-600">(this series)</span> : null}
                  </label>
                ))}
              </div>
            </fieldset>
            {rules.history.strength === 'soft' ? (
              <details className="rounded-xl bg-pine-50 p-3">
                <summary className="cursor-pointer text-sm font-semibold">Advanced scoring</summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <TextInput
                    label="Recency decay (0–1)"
                    type="number"
                    step="0.05"
                    min={0}
                    max={1}
                    value={rules.history.recencyDecay}
                    hint="Each older year counts this much as the year after it. Lower = older repeats matter less."
                    onChange={(e) => void updateRules(event.id, (r) => ({ ...r, history: { ...r.history, recencyDecay: Math.max(0, Math.min(1, Number(e.target.value))) } }))}
                  />
                  <TextInput
                    label="Frequency weight"
                    type="number"
                    step="0.1"
                    min={0}
                    max={10}
                    value={rules.history.frequencyWeight}
                    hint="Extra penalty for pairings that happened several times."
                    onChange={(e) => void updateRules(event.id, (r) => ({ ...r, history: { ...r.history, frequencyWeight: Math.max(0, Math.min(10, Number(e.target.value))) } }))}
                  />
                </div>
                <div className="mt-3">
                  <Toggle
                    checked={rules.history.discourageReverse}
                    onChange={(v) => void updateRules(event.id, (r) => ({ ...r, history: { ...r.history, discourageReverse: v } }))}
                    label="Also discourage drawing the person who drew you last time"
                  />
                </div>
              </details>
            ) : null}
            <p className="text-sm text-pine-700">
              {model && model.historyYears.length > 0
                ? `History found for: ${model.historyYears.join(', ')}. ${model.windowYears.length ? `Applying to: ${model.windowYears.join(', ')}.` : ''}`
                : 'No earlier history found for these participants yet. You can add past years on the History page.'}
            </p>
          </div>
        ) : null}
      </Card>

      <Card>
        <SectionTitle
          title="Who can buy for whom"
          description="Every rule combined. Select a square for the reason."
          action={
            <button
              type="button"
              className="btn-pine btn-sm"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  setDiagnosis(await diagnoseEvent(event.id));
                })
              }
            >
              <Icon.Check className="h-4 w-4" /> Check these rules
            </button>
          }
        />
        {busy ? <Spinner label="Checking every possibility…" /> : null}
        {diagnosis ? (
          <div className="mb-5">
            <DiagnosisPanel diagnosis={diagnosis} eventId={event.id} onApplied={() => setDiagnosis(null)} />
          </div>
        ) : null}
        {model ? <ConstraintMatrix model={model} /> : <Spinner />}
      </Card>
    </div>
  );
}
