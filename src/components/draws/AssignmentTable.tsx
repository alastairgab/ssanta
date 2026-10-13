import { useState } from 'react';
import type { Assignment, ID } from '../../types/models';
import { Icon } from '../ui/icons';
import { Toggle } from '../ui/ui';

/**
 * Assignment list with VISUAL concealment. This only hides names on screen (e.g. when someone is
 * looking over your shoulder) — the data is still in this browser and the organiser can view it.
 */
export function AssignmentTable({
  assignments,
  nameOf,
  concealed,
  onConcealChange,
  highlight,
}: {
  assignments: Assignment[];
  nameOf: (id: ID) => string;
  concealed: boolean;
  onConcealChange?: (v: boolean) => void;
  highlight?: Set<ID>;
}) {
  const [peek, setPeek] = useState<Set<ID>>(new Set());
  const sorted = [...assignments].sort((a, b) => nameOf(a.giverId).localeCompare(nameOf(b.giverId)));
  return (
    <div>
      {onConcealChange ? (
        <div className="mb-3">
          <Toggle
            checked={concealed}
            onChange={(v) => {
              setPeek(new Set());
              onConcealChange(v);
            }}
            label="Hide who is buying for whom"
            description="A screen-privacy feature only: it hides names on this page, but you can still reveal them and the data stays in this browser."
          />
        </div>
      ) : null}
      <div className="-mx-2 overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Giver</th>
              <th aria-hidden />
              <th>Buys for</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((a) => {
              const hidden = concealed && !peek.has(a.giverId);
              return (
                <tr key={a.giverId} className={highlight?.has(a.giverId) ? 'bg-gold-100' : undefined}>
                  <td className="max-w-[14rem] break-words font-medium">{nameOf(a.giverId)}</td>
                  <td aria-hidden className="text-pine-400">
                    →
                  </td>
                  <td>
                    {hidden ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-pine-100 px-2 py-1 text-xs font-semibold text-pine-700 hover:bg-pine-200"
                        onClick={() => setPeek(new Set([...peek, a.giverId]))}
                        aria-label={`Show who ${nameOf(a.giverId)} buys for`}
                      >
                        <Icon.EyeOff className="h-3.5 w-3.5" /> Hidden — show
                      </button>
                    ) : (
                      <span className="break-words">{nameOf(a.recipientId)}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
