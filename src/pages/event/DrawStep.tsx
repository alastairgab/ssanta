import { useMemo, useState } from 'react';
import { href, navigate } from '../../app/router';
import { Icon } from '../../components/ui/icons';
import { Callout, Card, ConfirmDialog, SectionTitle, Spinner, useAsyncAction, useToast } from '../../components/ui/ui';
import { DiagnosisPanel } from '../../components/constraints/DiagnosisPanel';
import { AssignmentTable } from '../../components/draws/AssignmentTable';
import { useConstraintModel } from '../../hooks/useConstraintModel';
import { summariseDraw } from '../../services/constraintValidator';
import { normaliseRules } from '../../services/drawIntegrity';
import { confirmDraftDraw, generateDraftDraw, type GenerateOutcome } from '../../services/eventOps';
import { sharedCount } from '../../services/drawVersions';
import { discardDraftDraw, updateEvent } from '../../services/storage';
import { canonicalJson } from '../../utils/canonicalJson';
import { formatDateTime, plural } from '../../utils/format';
import type { EventCtx } from './EventWorkspace';

function Check({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      {ok ? <Icon.Check className="mt-0.5 h-5 w-5 shrink-0 text-pine-600" /> : <Icon.X className="mt-0.5 h-5 w-5 shrink-0 text-berry-600" />}
      <span>
        <span className="sr-only">{ok ? 'Passed: ' : 'Failed: '}</span>
        {children}
      </span>
    </li>
  );
}

export default function DrawStep({ ctx }: { ctx: EventCtx }) {
  const { event, draftDraw, activeDraw, nameOf } = ctx;
  const { model } = useConstraintModel(ctx);
  const { busy, run } = useAsyncAction();
  const toast = useToast();
  const [failure, setFailure] = useState<Extract<GenerateOutcome, { ok: false }> | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [redrawOpen, setRedrawOpen] = useState(false);

  const checks = useMemo(() => (model && draftDraw ? summariseDraw(model, draftDraw.snapshot.assignments) : null), [model, draftDraw]);
  const stale = useMemo(() => {
    if (!draftDraw) return false;
    const rulesChanged = canonicalJson(normaliseRules(event.rules)) !== canonicalJson(draftDraw.snapshot.rules);
    const ids = new Set(draftDraw.snapshot.assignments.map((a) => a.giverId));
    const peopleChanged = ids.size !== event.participantIds.length || event.participantIds.some((id) => !ids.has(id));
    return rulesChanged || peopleChanged;
  }, [draftDraw, event]);

  const generate = () =>
    run(async () => {
      setFailure(null);
      const res = await generateDraftDraw(event.id);
      if (!res.ok) setFailure(res);
      return res;
    });

  const shared = sharedCount(activeDraw);

  if (event.participantIds.length < 2) {
    return (
      <Callout tone="info" title="Add participants first">
        A draw needs at least two people. <a className="font-semibold underline" href={href(`events/${event.id}/participants`)}>Add participants</a>.
      </Callout>
    );
  }
  if (event.status === 'archived') {
    return <Callout title="This exchange is archived">Unarchive it in Settings to make changes.</Callout>;
  }

  return (
    <div className="space-y-6">
      {!draftDraw ? (
        <Card>
          {activeDraw ? (
            <>
              <SectionTitle title={`Draw version ${activeDraw.version} is confirmed`} description={`Confirmed ${formatDateTime(activeDraw.confirmedAt)} · fingerprint ${activeDraw.integrity?.shortFingerprint ?? '—'}`} />
              <div className="flex flex-wrap gap-2">
                <a className="btn-primary" href={href(`events/${event.id}/share`)}>
                  Go to links <Icon.Chevron className="h-4 w-4" />
                </a>
                <button type="button" className="btn-secondary" onClick={() => setRedrawOpen(true)} disabled={busy}>
                  <Icon.Refresh className="h-4 w-4" /> Start a redraw
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center py-6 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-berry-50 text-berry-600">
                <Icon.Sparkle className="h-8 w-8" />
              </div>
              <h2 className="mt-4 text-2xl font-semibold">Ready to draw names?</h2>
              <p className="mt-1 max-w-md text-sm text-pine-700">
                {plural(event.participantIds.length, 'person', 'people')} · every rule is checked. Nothing is shared until you confirm and send links.
              </p>
              <button type="button" className="btn-primary mt-5 px-6 text-base" onClick={() => void generate()} disabled={busy}>
                {busy ? 'Drawing…' : 'Generate draw'}
              </button>
            </div>
          )}
          {busy ? (
            <div className="mt-4">
              <Spinner label="Finding a fair draw…" />
            </div>
          ) : null}
        </Card>
      ) : null}

      {failure ? (
        <Card>
          <SectionTitle title="Couldn't make a draw" />
          <DiagnosisPanel diagnosis={failure.diagnosis} eventId={event.id} onApplied={() => setFailure(null)} />
          <div className="mt-4 flex gap-2">
            <button type="button" className="btn-primary" onClick={() => void generate()} disabled={busy}>
              Try again
            </button>
            <a className="btn-secondary" href={href(`events/${event.id}/rules`)}>
              Edit rules
            </a>
          </div>
        </Card>
      ) : null}

      {draftDraw && checks ? (
        <Card>
          <SectionTitle
            title="Review the draw"
            description={`Generated ${formatDateTime(draftDraw.snapshot.generatedAt)}. This is a draft — nothing is saved as final until you confirm.`}
          />
          {stale ? (
            <Callout tone="warning" className="mb-4" title="Rules or participants changed since this draft">
              Generate a new draw so it reflects your latest settings.
            </Callout>
          ) : null}
          {activeDraw && shared > 0 ? (
            <Callout tone="danger" className="mb-4" title={`Links for draw v${activeDraw.version} have been marked as shared with ${plural(shared, 'participant')}`}>
              Confirming this redraw may require you to notify them and send replacement links. Old links can’t be switched off — they will keep showing their old assignment.
            </Callout>
          ) : null}
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <div>
              <dl className="mb-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-pine-50 p-3">
                  <dt className="text-xs text-pine-600">People</dt>
                  <dd className="text-xl font-semibold">{draftDraw.snapshot.assignments.length}</dd>
                </div>
                <div className="rounded-xl bg-pine-50 p-3">
                  <dt className="text-xs text-pine-600">Repeats</dt>
                  <dd className="text-xl font-semibold">{checks.repeatCount}</dd>
                </div>
                <div className="rounded-xl bg-pine-50 p-3">
                  <dt className="text-xs text-pine-600">Fairness score</dt>
                  <dd className="text-xl font-semibold" title="Total soft history penalty; 0 is best">
                    {draftDraw.snapshot.solver.softScore}
                  </dd>
                </div>
              </dl>
              <ul className="space-y-2 text-sm">
                <Check ok={checks.valid}>{checks.valid ? 'Valid: everyone gives one gift and receives one gift; nobody draws themselves' : `Invalid: ${checks.problems.join('; ')}`}</Check>
                <Check ok={checks.forcedSatisfied === checks.forcedTotal}>
                  Forced pairings satisfied: {checks.forcedSatisfied}/{checks.forcedTotal}
                </Check>
                <Check ok={checks.blockedPairsRespected}>Forbidden, relationship, household and history exclusions respected</Check>
                <Check ok={!event.rules.preventReciprocal || checks.reciprocalPairs === 0}>
                  {event.rules.preventReciprocal ? 'No direct swaps' : `Direct swaps allowed (${checks.reciprocalPairs} in this draw)`}
                </Check>
                <li className="flex items-start gap-2 text-pine-700">
                  <Icon.Info className="mt-0.5 h-5 w-5 shrink-0" />
                  <span>
                    {checks.repeatCount === 0
                      ? 'No pairing has happened before in the counted history.'
                      : `${plural(checks.repeatCount, 'pairing')} happened in an earlier year.`}{' '}
                    {draftDraw.snapshot.solver.provenOptimal
                      ? draftDraw.snapshot.solver.softScore > 0
                        ? 'This is proven to be the least-repeating draw possible under your rules.'
                        : ''
                      : 'The optimiser stopped at its time limit, so a slightly fairer draw might exist.'}
                  </span>
                </li>
              </ul>
              <p className="mt-4 text-xs text-pine-500">
                Draws are chosen at random among the fairest options using your browser’s secure random generator. They are not guaranteed to be a uniform sample of every possible draw.
              </p>
            </div>
            <AssignmentTable
              assignments={draftDraw.snapshot.assignments}
              nameOf={nameOf}
              concealed={event.concealAssignments}
              onConcealChange={(v) => void updateEvent(event.id, { concealAssignments: v })}
            />
          </div>
          <div className="mt-6 flex flex-wrap gap-2 border-t border-pine-100 pt-5">
            <button type="button" className="btn-primary" disabled={!checks.valid || stale || busy} onClick={() => setConfirmOpen(true)}>
              <Icon.Lock className="h-4 w-4" /> Confirm this draw
            </button>
            <button type="button" className="btn-secondary" onClick={() => void generate()} disabled={busy}>
              <Icon.Refresh className="h-4 w-4" /> Generate another
            </button>
            <a className="btn-ghost" href={href(`events/${event.id}/rules`)}>
              Back to rules
            </a>
            <button type="button" className="btn-ghost text-berry-700" onClick={() => void discardDraftDraw(event.id)}>
              Discard draft
            </button>
          </div>
        </Card>
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        title={activeDraw ? `Replace draw v${activeDraw.version}?` : 'Confirm this draw?'}
        confirmLabel={activeDraw ? 'Confirm new version' : 'Confirm draw'}
        danger={Boolean(activeDraw && shared > 0)}
        busy={busy}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={async () => {
          const d = await run(() => confirmDraftDraw(event.id));
          setConfirmOpen(false);
          if (d) {
            toast(`Draw v${d.version} confirmed · fingerprint ${d.integrity?.shortFingerprint}`);
            navigate(`events/${event.id}/share`);
          }
        }}
      >
        <p>The draw will be frozen as a new version with a tamper-evident fingerprint. It can’t be edited afterwards — only replaced by another version.</p>
        {activeDraw ? (
          <p className="font-semibold text-berry-800">
            Version {activeDraw.version} will be marked as superseded (it’s kept for your records).
            {shared > 0 ? ` ${plural(shared, 'person has', 'people have')} already been sent links for it; those links will keep showing the old assignment, so tell them to use their new link.` : ''}
          </p>
        ) : null}
      </ConfirmDialog>
      <ConfirmDialog
        open={redrawOpen}
        title="Start a redraw?"
        confirmLabel="Generate a new draft"
        danger={shared > 0}
        requireText={shared > 0 ? 'REDRAW' : undefined}
        onCancel={() => setRedrawOpen(false)}
        onConfirm={async () => {
          setRedrawOpen(false);
          await generate();
        }}
      >
        <p>This creates a new draft draw. Your confirmed version {activeDraw?.version} stays active until you confirm the new one.</p>
        {shared > 0 ? (
          <p className="font-semibold text-berry-800">
            Links for the current draw have already been marked as shared with {plural(shared, 'participant')}. Regenerating assignments may require you to notify them and distribute replacement links. If only one person dropped out, use Withdrawals instead — it changes as few assignments as possible.
          </p>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}
