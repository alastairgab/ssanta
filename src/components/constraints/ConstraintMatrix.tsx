import { useState } from 'react';
import type { ConstraintModel, RuleRef } from '../../services/constraintModel';

type CellKind = 'self' | 'forced' | 'forced-elsewhere' | 'forbidden' | 'relationship' | 'household' | 'history' | 'soft' | 'allowed';

const CELL: Record<CellKind, { glyph: string; label: string; cls: string }> = {
  self: { glyph: '—', label: 'Self', cls: 'bg-gray-100 text-gray-400' },
  forced: { glyph: '★', label: 'Forced', cls: 'bg-gold-300 text-pine-950 font-bold' },
  'forced-elsewhere': { glyph: '·', label: 'Taken by a forced pairing', cls: 'bg-gold-100 text-gold-600' },
  forbidden: { glyph: '✕', label: 'Forbidden (manual rule)', cls: 'bg-berry-600 text-white' },
  relationship: { glyph: '♥', label: 'Relationship restriction', cls: 'bg-berry-200 text-berry-900' },
  household: { glyph: '⌂', label: 'Same household / group', cls: 'bg-orange-200 text-orange-900' },
  history: { glyph: '↺', label: 'Excluded by history', cls: 'bg-sky-200 text-sky-900' },
  soft: { glyph: '≈', label: 'Allowed but discouraged (history)', cls: 'bg-sky-50 text-sky-800' },
  allowed: { glyph: '✓', label: 'Allowed', cls: 'bg-pine-50 text-pine-600' },
};

function primaryKind(model: ConstraintModel, g: number, r: number): CellKind {
  if (g === r) return 'self';
  if (model.forcedTo[g] === r) return 'forced';
  const reasons = model.blocked[g]![r]!;
  const kinds = new Set(reasons.map((x: { rule: RuleRef }) => x.rule.kind));
  if (kinds.has('forbidden')) return 'forbidden';
  if (kinds.has('relationship')) return 'relationship';
  if (kinds.has('household')) return 'household';
  if (kinds.has('history')) return 'history';
  if (kinds.has('forced-giver') || kinds.has('forced-recipient')) return 'forced-elsewhere';
  if (model.cost[g]![r]! > 0) return 'soft';
  return 'allowed';
}

export function ConstraintMatrix({ model }: { model: ConstraintModel }) {
  const [sel, setSel] = useState<[number, number] | null>(null);
  const n = model.n;
  if (n < 2) return <p className="text-sm text-pine-700">Add at least two participants to see the matrix.</p>;
  const explain = (g: number, r: number) => {
    if (g === r) return `${model.labels[g]} can't buy for themselves.`;
    if (model.forcedTo[g] === r) return `${model.labels[g]} must buy for ${model.labels[r]} (forced pairing).`;
    const reasons = model.blocked[g]![r]!;
    if (reasons.length) return `${model.labels[g]} can't buy for ${model.labels[r]}: ${model.labels[r]} is ${reasons.map((x) => x.text).join(' and ')}.`;
    if (model.cost[g]![r]! > 0) return `${model.labels[g]} → ${model.labels[r]} is allowed but discouraged because they were paired before (penalty ${model.cost[g]![r]}). The draw avoids it if it can.`;
    return `${model.labels[g]} can buy for ${model.labels[r]}.`;
  };
  return (
    <div>
      <ul className="mb-3 flex flex-wrap gap-2 text-xs" aria-label="Legend">
        {(Object.keys(CELL) as CellKind[]).map((k) => (
          <li key={k} className="flex items-center gap-1.5">
            <span className={`inline-flex h-6 w-6 items-center justify-center rounded ${CELL[k].cls}`} aria-hidden>
              {CELL[k].glyph}
            </span>
            {CELL[k].label}
          </li>
        ))}
      </ul>
      <div className="overflow-auto rounded-xl ring-1 ring-pine-100" style={{ maxHeight: '28rem' }}>
        <table className="border-separate border-spacing-0.5 text-xs">
          <caption className="sr-only">Who can buy for whom. Rows are givers, columns are recipients.</caption>
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-20 bg-white p-1 text-left font-semibold text-pine-600">Giver ↓ / Recipient →</th>
              {model.labels.map((l, r) => (
                <th key={r} scope="col" className="sticky top-0 z-10 h-28 bg-white align-bottom">
                  <div className="mx-auto w-6 truncate whitespace-nowrap text-left font-medium [writing-mode:vertical-rl] rotate-180" title={l}>
                    {l}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {model.labels.map((gl, g) => (
              <tr key={g}>
                <th scope="row" className="sticky left-0 z-10 max-w-[10rem] truncate bg-white p-1 pr-2 text-left font-medium" title={gl}>
                  {gl}
                </th>
                {model.labels.map((rl, r) => {
                  const k = primaryKind(model, g, r);
                  const selected = sel?.[0] === g && sel?.[1] === r;
                  return (
                    <td key={r} className="p-0">
                      <button
                        type="button"
                        onClick={() => setSel([g, r])}
                        aria-label={`${gl} to ${rl}: ${CELL[k].label}`}
                        className={`flex h-7 w-7 items-center justify-center rounded ${CELL[k].cls} ${selected ? 'ring-2 ring-pine-900' : ''}`}
                      >
                        <span aria-hidden>{CELL[k].glyph}</span>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 min-h-[2.5rem] rounded-lg bg-pine-50 p-3 text-sm" aria-live="polite">
        {sel ? explain(sel[0], sel[1]) : 'Select a square to see why a pairing is allowed or not.'}
      </p>
    </div>
  );
}
