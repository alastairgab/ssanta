import type { HistoricalPreferencePolicy, HistoryEntry, ID } from '../types/models';

/**
 * Historical fairness model
 * =========================
 *
 * Inputs: history entries (giver → recipient, year, series) from the series the organiser
 * selected as history sources, restricted to years strictly before the current event year.
 *
 * "Event years" are the distinct years that actually have history, newest first. So
 * "avoid previous event year" means the most recent earlier exchange, even if a year was skipped.
 *
 * Window size by mode: none = 0, last-1 = 1, last-2 = 2, last-3 = 3, all = every year,
 * custom = customYears.
 *
 * HARD strength: any pairing (giver → recipient) that occurred inside the window is forbidden.
 *
 * SOFT strength: pairings inside the window are allowed but penalised. For a pairing g → r:
 *
 *     base(g, r)   = Σ over occurrences k inside the window of  round(100 × recencyDecay^rank_k)
 *                    where rank_k = 0 for the most recent earlier event year, 1 for the one before, …
 *     penalty(g,r) = round( base(g, r) × (1 + frequencyWeight × (count(g, r) − 1)) )
 *     + 25 if discourageReverse and r → g occurred in the most recent window year
 *
 * The solver minimises the total penalty over all pairings, so recent and frequent repeats are
 * avoided first. A penalty of 0 means the pairing has no history inside the window.
 * (The number of alternative recipients is handled implicitly: the optimiser only uses a penalised
 * pairing when no zero-penalty arrangement exists for the whole group.)
 */

export const REVERSE_PENALTY = 25;

export function historyWindowSize(policy: HistoricalPreferencePolicy): number {
  switch (policy.mode) {
    case 'none':
      return 0;
    case 'last-1':
      return 1;
    case 'last-2':
      return 2;
    case 'last-3':
      return 3;
    case 'all':
      return Number.POSITIVE_INFINITY;
    case 'custom':
      return Math.max(0, Math.floor(policy.customYears ?? 0));
  }
}

export function describeHistoryMode(policy: HistoricalPreferencePolicy): string {
  const size = historyWindowSize(policy);
  if (size === 0) return 'No history restrictions';
  const what = size === Number.POSITIVE_INFINITY ? 'all previous recipients' : size === 1 ? 'the previous event year' : `the previous ${size} event years`;
  return `${policy.strength === 'hard' ? 'Never repeat' : 'Try to avoid repeating'} ${what}`;
}

export interface HistoryWindow {
  /** Years inside the window, newest first. */
  years: number[];
  /** All earlier years with history from the source series, newest first. */
  allYears: number[];
  entries: HistoryEntry[];
  /** All relevant earlier entries (regardless of window), used for repeat counting. */
  allEntries: HistoryEntry[];
}

export function computeHistoryWindow(
  history: HistoryEntry[],
  policy: HistoricalPreferencePolicy,
  eventYear: number,
  participantIds: Set<ID>,
): HistoryWindow {
  const sources = new Set(policy.sourceSeriesIds);
  const allEntries = history.filter(
    (h) => sources.has(h.seriesId) && h.year < eventYear && participantIds.has(h.giverId) && participantIds.has(h.recipientId),
  );
  const allYears = Array.from(new Set(history.filter((h) => sources.has(h.seriesId) && h.year < eventYear).map((h) => h.year))).sort(
    (a, b) => b - a,
  );
  const size = historyWindowSize(policy);
  const years = size === Number.POSITIVE_INFINITY ? allYears : allYears.slice(0, size);
  const yearSet = new Set(years);
  return { years, allYears, entries: allEntries.filter((h) => yearSet.has(h.year)), allEntries };
}

export interface PairHistory {
  /** Years (newest first) the pairing occurred inside the window. */
  windowYears: number[];
  /** Total occurrences across all earlier history. */
  everCount: number;
}

const pairKey = (g: ID, r: ID) => `${g}>${r}`;

export function indexPairs(entries: HistoryEntry[]): Map<string, number[]> {
  const map = new Map<string, number[]>();
  for (const e of entries) {
    const k = pairKey(e.giverId, e.recipientId);
    const list = map.get(k) ?? [];
    if (!list.includes(e.year)) list.push(e.year);
    map.set(k, list);
  }
  for (const list of map.values()) list.sort((a, b) => b - a);
  return map;
}

export function softPenalty(
  windowYearsOfPair: number[],
  window: HistoryWindow,
  policy: HistoricalPreferencePolicy,
  reverseInMostRecent: boolean,
): number {
  let base = 0;
  for (const y of windowYearsOfPair) {
    const rank = window.years.indexOf(y);
    if (rank < 0) continue;
    base += Math.round(100 * Math.pow(clamp(policy.recencyDecay, 0, 1), rank));
  }
  let penalty = 0;
  if (windowYearsOfPair.length > 0) {
    penalty = Math.round(base * (1 + Math.max(0, policy.frequencyWeight) * (windowYearsOfPair.length - 1)));
  }
  if (policy.discourageReverse && reverseInMostRecent) penalty += REVERSE_PENALTY;
  return penalty;
}

function clamp(x: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, Number.isFinite(x) ? x : lo));
}

export { pairKey };

/** Per-giver fairness summary across history (for dashboards). */
export function fairnessSummary(entries: HistoryEntry[], ids: ID[]) {
  return ids.map((id) => {
    const given = entries.filter((e) => e.giverId === id);
    const distinct = new Set(given.map((e) => e.recipientId));
    const counts = new Map<ID, number>();
    for (const e of given) counts.set(e.recipientId, (counts.get(e.recipientId) ?? 0) + 1);
    const repeats = Array.from(counts.values()).reduce((s, c) => s + Math.max(0, c - 1), 0);
    return { id, years: given.length, distinctRecipients: distinct.size, repeats };
  });
}
