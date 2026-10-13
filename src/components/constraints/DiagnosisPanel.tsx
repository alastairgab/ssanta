import { useState } from 'react';
import type { Diagnosis, Remedy } from '../../services/conflictAnalyzer';
import { applyRemedy } from '../../services/conflictAnalyzer';
import { updateRules } from '../../services/storage';
import { Callout, ConfirmDialog, useToast } from '../ui/ui';
import { Icon } from '../ui/icons';

/**
 * Shows solver-backed explanations and VERIFIED remedies. Rules are only changed when the organiser
 * picks a remedy and confirms the exact changes.
 */
export function DiagnosisPanel({ diagnosis, eventId, onApplied }: { diagnosis: Diagnosis; eventId: string; onApplied?: () => void }) {
  const [pending, setPending] = useState<Remedy | null>(null);
  const toast = useToast();
  if (diagnosis.feasible === true) {
    return (
      <Callout tone="success" title="These rules work">
        A valid draw exists with the current rules.
      </Callout>
    );
  }
  const rs = diagnosis.remedySearch;
  return (
    <div className="space-y-4" aria-live="polite">
      <Callout tone="danger" title={diagnosis.feasible === 'unknown' ? 'No draw found yet' : 'No valid draw is possible with the current rules'}>
        {diagnosis.inconclusive ? <p>{diagnosis.inconclusive}</p> : <p>Here’s exactly what’s getting in the way:</p>}
      </Callout>
      {diagnosis.issues.length > 0 ? (
        <section>
          <h3 className="mb-2 font-semibold">Conflicting rules</h3>
          <ul className="space-y-2">
            {diagnosis.issues.map((i, idx) => (
              <li key={idx} className="rounded-xl bg-berry-50 p-3 text-sm text-berry-950 ring-1 ring-berry-200">
                {i.message}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {diagnosis.stuckGivers.length + diagnosis.stuckRecipients.length > 0 ? (
        <section>
          <h3 className="mb-2 font-semibold">People with no possible match</h3>
          <ul className="space-y-2">
            {[...diagnosis.stuckGivers, ...diagnosis.stuckRecipients].map((s, idx) => (
              <li key={idx} className="rounded-xl bg-white p-3 text-sm ring-1 ring-pine-200">
                {s.message}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {diagnosis.global ? (
        <section>
          <h3 className="mb-2 font-semibold">Not enough options to go round</h3>
          <p className="rounded-xl bg-white p-3 text-sm ring-1 ring-pine-200">{diagnosis.global.message}</p>
        </section>
      ) : null}
      {diagnosis.reciprocalOnly ? <p className="rounded-xl bg-white p-3 text-sm ring-1 ring-pine-200">{diagnosis.reciprocalOnly}</p> : null}

      <section>
        <h3 className="mb-2 font-semibold">Suggested fixes</h3>
        {diagnosis.remedies.length === 0 ? (
          <p className="text-sm text-pine-700">
            No single or paired rule change produced a valid draw{rs.timedOut ? ' before the search time limit' : ''}. Try adding participants or relaxing several rules.
          </p>
        ) : (
          <>
            <p className="mb-2 text-sm text-pine-700">
              Each suggestion below was tested: applying it produces at least one valid draw. Nothing changes until you choose one.
              {diagnosis.remedies[0]!.changes.length === 1
                ? ' Suggestions with a single change are the smallest possible fix.'
                : rs.exhaustiveSingles
                  ? ' No single rule change works, so at least two changes are needed.'
                  : ''}
              {rs.timedOut ? ' The search stopped at its time limit, so other fixes may exist.' : ''}
            </p>
            <ol className="space-y-2">
              {diagnosis.remedies.map((r, idx) => (
                <li key={idx} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-3 ring-1 ring-pine-200">
                  <div className="min-w-0 flex-1 text-sm">
                    <ul className="list-disc space-y-0.5 pl-5">
                      {r.descriptions.map((d, j) => (
                        <li key={j}>{d}</li>
                      ))}
                    </ul>
                    {r.repeatCount > 0 ? <p className="mt-1 text-xs text-pine-600">The tested draw repeated {r.repeatCount} previous pairing(s).</p> : null}
                  </div>
                  <button type="button" className="btn-secondary btn-sm" onClick={() => setPending(r)}>
                    <Icon.Check className="h-4 w-4" /> Review & apply
                  </button>
                </li>
              ))}
            </ol>
          </>
        )}
        <p className="mt-2 text-xs text-pine-500">
          Checked {rs.singlesTested} of {rs.singlesTotal} single changes{rs.pairsTotal ? ` and ${rs.pairsTested} of ${rs.pairsTotal} pairs` : ''}.
        </p>
      </section>

      <ConfirmDialog
        open={pending !== null}
        title="Apply this change to your rules?"
        confirmLabel="Apply change"
        onCancel={() => setPending(null)}
        onConfirm={async () => {
          if (!pending) return;
          await updateRules(eventId, (rules) => applyRemedy(rules, pending));
          setPending(null);
          toast('Rules updated');
          onApplied?.();
        }}
      >
        <p>These rule changes will be saved for this exchange:</p>
        <ul className="list-disc space-y-1 pl-5">{pending?.descriptions.map((d, i) => <li key={i}>{d}</li>)}</ul>
        <p>You can undo them at any time on the Rules and Relationships pages.</p>
      </ConfirmDialog>
    </div>
  );
}
