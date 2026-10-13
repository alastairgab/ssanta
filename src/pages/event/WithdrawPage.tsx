import { useState } from 'react';
import { href, navigate } from '../../app/router';
import { Icon } from '../../components/ui/icons';
import { Callout, Card, ConfirmDialog, SectionTitle, Spinner, TextInput, useAsyncAction, useToast } from '../../components/ui/ui';
import { applyWithdrawalRepair, planWithdrawal } from '../../services/eventOps';
import type { RepairResult } from '../../services/drawRepair';
import type { ID } from '../../types/models';
import { plural } from '../../utils/format';
import type { EventCtx } from './EventWorkspace';

export default function WithdrawPage({ ctx }: { ctx: EventCtx }) {
  const { event, activeDraw: draw, nameOf } = ctx;
  const [selected, setSelected] = useState<Set<ID>>(new Set());
  const [result, setResult] = useState<RepairResult | null>(null);
  const [note, setNote] = useState('');
  const [confirm, setConfirm] = useState(false);
  const { busy, run } = useAsyncAction();
  const toast = useToast();

  if (!draw) {
    return (
      <Callout title="No confirmed draw">
        Withdrawals repair a confirmed draw. If you haven't confirmed one yet, just remove the person on the <a className="font-semibold underline" href={href(`events/${event.id}/participants`)}>Participants</a> page.
      </Callout>
    );
  }
  const people = draw.snapshot.participants;
  const sharedWithdrawn = Array.from(selected).filter((id) => draw.distribution[id]?.shared);

  return (
    <div className="space-y-6">
      <Card>
        <SectionTitle
          title="Someone can't take part any more?"
          description={`Pick who is withdrawing from draw v${draw.version}. The app finds a valid new arrangement that changes as few assignments as possible and still follows all your rules.`}
        />
        <fieldset>
          <legend className="sr-only">Withdrawing participants</legend>
          <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
            {people.map((p) => (
              <li key={p.id}>
                <label className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-pine-50">
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-berry-600"
                    checked={selected.has(p.id)}
                    onChange={(e) => {
                      const s = new Set(selected);
                      if (e.target.checked) s.add(p.id);
                      else s.delete(p.id);
                      setSelected(s);
                      setResult(null);
                    }}
                  />
                  {nameOf(p.id)}
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
        {selected.size > 0 ? (
          <div className="mt-4 rounded-xl bg-pine-50 p-4 text-sm">
            {Array.from(selected).map((id) => {
              const gives = draw.snapshot.assignments.find((a) => a.giverId === id)?.recipientId;
              const from = draw.snapshot.assignments.find((a) => a.recipientId === id)?.giverId;
              return (
                <p key={id}>
                  <strong>{nameOf(id)}</strong> was buying for {gives ? nameOf(gives) : '—'}; {from ? nameOf(from) : '—'} was buying for them. {draw.distribution[id]?.shared ? 'Their link was marked as shared.' : ''}
                </p>
              );
            })}
          </div>
        ) : null}
        <button
          type="button"
          className="btn-primary mt-4"
          disabled={selected.size === 0 || selected.size > people.length - 2 || busy}
          onClick={() =>
            void run(async () => {
              const { result: r } = await planWithdrawal(event.id, Array.from(selected));
              setResult(r as RepairResult);
            })
          }
        >
          Find the smallest change
        </button>
        {busy ? (
          <div className="mt-3">
            <Spinner label="Searching for a minimal repair…" />
          </div>
        ) : null}
      </Card>

      {result && !result.ok ? (
        <Callout tone="danger" title="No valid repair found">
          {result.status === 'inconclusive'
            ? 'The search hit its time limit before finding a repair. You can relax some rules or start a full redraw.'
            : 'The remaining people can’t be matched under the current rules (for example, two people left with “no direct swaps” switched on). Relax a rule, or do a full redraw from the Draw page to see detailed suggestions.'}
        </Callout>
      ) : null}

      {result && result.ok ? (
        <Card>
          <SectionTitle
            title={`Proposed repair: ${plural(result.repair.changed.length, 'assignment')} change`}
            description={
              result.repair.solver.provenOptimal
                ? 'This is proven to be the fewest changes possible under your rules.'
                : 'The search stopped at its time limit; this repair is valid but a smaller one might exist.'
            }
          />
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-berry-700">Removed</h3>
              <ul className="space-y-1 text-sm">
                {result.repair.withdrawnIds.map((id) => (
                  <li key={id} className="rounded-lg bg-berry-50 px-3 py-2">
                    {nameOf(id)}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gold-600">Changed — need a new link</h3>
              <ul className="space-y-1 text-sm">
                {result.repair.changed.map((c) => (
                  <li key={c.giverId} className="rounded-lg bg-gold-100 px-3 py-2">
                    <strong>{nameOf(c.giverId)}</strong>: {c.from ? nameOf(c.from) : '—'} → {nameOf(c.to)}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-pine-700">Unchanged — existing link still correct</h3>
              <ul className="space-y-1 text-sm">
                {result.repair.unchanged.map((a) => (
                  <li key={a.giverId} className="rounded-lg bg-pine-50 px-3 py-2">
                    {nameOf(a.giverId)} → {nameOf(a.recipientId)}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="mt-5 max-w-lg">
            <TextInput label="Note for the record (optional)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nala is travelling this year" maxLength={500} />
          </div>
          <div className="mt-5 flex gap-2">
            <button type="button" className="btn-primary" onClick={() => setConfirm(true)}>
              <Icon.Lock className="h-4 w-4" /> Apply as draw v{draw.version + 1}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setResult(null)}>
              Cancel
            </button>
          </div>
        </Card>
      ) : null}

      <ConfirmDialog
        open={confirm}
        title="Apply this repair?"
        confirmLabel="Create new version"
        busy={busy}
        onCancel={() => setConfirm(false)}
        onConfirm={async () => {
          if (!result || !result.ok) return;
          const v = await run(() => applyWithdrawalRepair(event.id, result.repair, note.trim() || undefined));
          setConfirm(false);
          if (v) {
            toast(`Draw v${v.version} confirmed · ${v.integrity?.shortFingerprint}`);
            navigate(`events/${event.id}/share`);
          }
        }}
      >
        <p>A new, frozen draw version will be created. Version {draw.version} is kept as superseded.</p>
        <p>
          Next, create replacement links for the {plural(result && result.ok ? result.repair.changed.length : 0, 'person', 'people')} whose assignment changed and send them yourself — the app can’t notify anyone.
        </p>
        <p className="font-semibold text-berry-800">
          Links already sent can’t be switched off. {sharedWithdrawn.length > 0 ? `${sharedWithdrawn.map(nameOf).join(', ')} still ha${sharedWithdrawn.length === 1 ? 's' : 've'} a working link to their old assignment.` : ''} Let affected people know which link is current.
        </p>
      </ConfirmDialog>
    </div>
  );
}
