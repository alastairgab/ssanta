import type { HistoryEntry, ID } from '../../types/models';

/**
 * Giver × recipient heatmap of how often each pairing happened. Single-hue sequential ramp
 * (light → dark pine) for magnitude; counts are printed in cells so identity never relies on colour,
 * and the history table on the same page is the accessible table view.
 */
const RAMP = ['#f0f7f3', '#b8dbc6', '#57a27c', '#256a4b', '#15382b'];

export function PairingHeatmap({ entries, ids, nameOf }: { entries: HistoryEntry[]; ids: ID[]; nameOf: (id: ID) => string }) {
  const counts = new Map<string, number>();
  for (const e of entries) counts.set(`${e.giverId}>${e.recipientId}`, (counts.get(`${e.giverId}>${e.recipientId}`) ?? 0) + 1);
  const max = Math.max(1, ...counts.values());
  if (ids.length < 2) return <p className="text-sm text-pine-700">Not enough history yet.</p>;
  return (
    <div>
      <div className="overflow-auto rounded-xl ring-1 ring-pine-100" style={{ maxHeight: '30rem' }}>
        <table className="border-separate border-spacing-0.5 text-xs">
          <caption className="sr-only">Number of times each giver bought for each recipient</caption>
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-20 bg-white p-1 text-left text-pine-600">Giver ↓ / Recipient →</th>
              {ids.map((r) => (
                <th key={r} scope="col" className="sticky top-0 z-10 h-28 bg-white align-bottom">
                  <div className="mx-auto w-7 truncate whitespace-nowrap text-left font-medium [writing-mode:vertical-rl] rotate-180" title={nameOf(r)}>
                    {nameOf(r)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ids.map((g) => (
              <tr key={g}>
                <th scope="row" className="sticky left-0 z-10 max-w-[10rem] truncate bg-white p-1 pr-2 text-left font-medium" title={nameOf(g)}>
                  {nameOf(g)}
                </th>
                {ids.map((r) => {
                  if (g === r) return <td key={r} className="h-7 w-7 rounded bg-gray-100" aria-label="Self" />;
                  const c = counts.get(`${g}>${r}`) ?? 0;
                  const step = c === 0 ? 0 : Math.min(4, Math.ceil((c / max) * 4));
                  return (
                    <td
                      key={r}
                      title={`${nameOf(g)} → ${nameOf(r)}: ${c} time${c === 1 ? '' : 's'}`}
                      className="h-7 w-7 rounded text-center font-semibold"
                      style={{ background: RAMP[step], color: step >= 3 ? '#ffffff' : '#0b1f18' }}
                    >
                      {c > 0 ? c : ''}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex items-center gap-2 text-xs text-pine-700" aria-hidden>
        Fewer
        {RAMP.map((c) => (
          <span key={c} className="h-3 w-6 rounded-sm" style={{ background: c }} />
        ))}
        More pairings
      </div>
    </div>
  );
}
