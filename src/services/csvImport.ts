import type { DrawVersion, ExchangeEvent, HistoryEntry, ID, Participant } from '../types/models';
import { parseCsv, parseCsvObjects, toCsv } from '../utils/csv';
import { participantLabel } from '../utils/format';

/**
 * CSV / bulk import and export.
 * Imported names are matched to existing participants by name; ambiguous or unknown names are
 * returned for the organiser to resolve in the UI — never silently guessed.
 */

export interface ParticipantImportRow {
  displayName: string;
  nickname?: string;
  notes?: string;
  household?: string;
  disambiguator?: string;
}

/** Bulk paste: one name per line (commas/semicolons also split if there's only one line). */
export function parseBulkNames(text: string): string[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const parts = lines.length === 1 ? lines[0]!.split(/[;,]/) : lines;
  return parts
    .map((p) => p.replace(/^[-*•\d.)\s]+/, '').trim())
    .filter((p) => p.length > 0 && p.length <= 200);
}

export function parseParticipantCsv(text: string): ParticipantImportRow[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const header = rows[0]!.map((h) => h.trim().toLowerCase());
  const hasHeader = header.includes('name') || header.includes('display name') || header.includes('displayname');
  if (!hasHeader) {
    return rows.map((r) => ({ displayName: (r[0] ?? '').trim() })).filter((r) => r.displayName);
  }
  return parseCsvObjects(text)
    .map((o) => ({
      displayName: (o['name'] ?? o['display name'] ?? o['displayname'] ?? '').slice(0, 200),
      nickname: o['nickname'] || undefined,
      notes: o['notes'] || undefined,
      household: o['household'] || o['group'] || undefined,
      disambiguator: o['disambiguator'] || o['label'] || undefined,
    }))
    .filter((r) => r.displayName);
}

export interface HistoryImportRow {
  line: number;
  year: number | null;
  giverName: string;
  recipientName: string;
}

export function parseHistoryCsv(text: string): HistoryImportRow[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const header = rows[0]!.map((h) => h.trim().toLowerCase());
  const hasHeader = header.includes('giver') || header.includes('year');
  const body = hasHeader ? rows.slice(1) : rows;
  const yi = hasHeader ? header.indexOf('year') : 0;
  const gi = hasHeader ? header.findIndex((h) => h === 'giver' || h === 'from') : 1;
  const ri = hasHeader ? header.findIndex((h) => h === 'recipient' || h === 'to' || h === 'receiver') : 2;
  return body.map((r, idx) => {
    const yearNum = Number((r[yi] ?? '').trim());
    return {
      line: idx + (hasHeader ? 2 : 1),
      year: Number.isInteger(yearNum) && yearNum >= 1900 && yearNum <= 3000 ? yearNum : null,
      giverName: (r[gi] ?? '').trim(),
      recipientName: (r[ri] ?? '').trim(),
    };
  });
}

export type NameResolution =
  | { status: 'matched'; id: ID }
  | { status: 'ambiguous'; candidates: ID[] }
  | { status: 'unknown' };

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

export function resolveName(name: string, participants: Participant[]): NameResolution {
  const n = norm(name);
  if (!n) return { status: 'unknown' };
  const byLabel = participants.filter((p) => norm(participantLabel(p)) === n);
  if (byLabel.length === 1) return { status: 'matched', id: byLabel[0]!.id };
  const byName = participants.filter((p) => norm(p.displayName) === n || (p.nickname && norm(p.nickname) === n));
  if (byName.length === 1) return { status: 'matched', id: byName[0]!.id };
  if (byName.length > 1) return { status: 'ambiguous', candidates: byName.map((p) => p.id) };
  return { status: 'unknown' };
}

/** Collect the distinct names in an import that need organiser attention. */
export function namesNeedingResolution(rows: HistoryImportRow[], participants: Participant[]): { name: string; resolution: NameResolution }[] {
  const names = new Set<string>();
  rows.forEach((r) => {
    names.add(r.giverName);
    names.add(r.recipientName);
  });
  return Array.from(names)
    .filter(Boolean)
    .map((name) => ({ name, resolution: resolveName(name, participants) }))
    .filter((x) => x.resolution.status !== 'matched');
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export function participantsCsv(participants: Participant[], householdOf: (id: ID) => string | undefined): string {
  return toCsv([
    ['name', 'nickname', 'disambiguator', 'household', 'active', 'notes', 'id'],
    ...participants.map((p) => [p.displayName, p.nickname ?? '', p.disambiguator ?? '', householdOf(p.id) ?? '', p.active ? 'yes' : 'no', p.notes ?? '', p.id]),
  ]);
}

export function historyCsv(entries: HistoryEntry[], nameOf: (id: ID) => string, seriesName: (id: ID) => string): string {
  const sorted = [...entries].sort((a, b) => b.year - a.year || nameOf(a.giverId).localeCompare(nameOf(b.giverId)));
  return toCsv([['year', 'giver', 'recipient', 'series', 'source'], ...sorted.map((e) => [e.year, nameOf(e.giverId), nameOf(e.recipientId), seriesName(e.seriesId), e.source])]);
}

export function assignmentsCsv(draw: DrawVersion, nameOf: (id: ID) => string): string {
  return toCsv([
    ['giver', 'recipient', 'draw version', 'fingerprint'],
    ...draw.snapshot.assignments.map((a) => [nameOf(a.giverId), nameOf(a.recipientId), draw.version, draw.integrity?.shortFingerprint ?? '']),
  ]);
}

export function linksCsv(event: ExchangeEvent, draw: DrawVersion, nameOf: (id: ID) => string): string {
  return toCsv([
    ['participant', 'codename', 'link', 'draw version', 'link issue', 'shared'],
    ...draw.snapshot.assignments.map((a) => {
      const d = draw.distribution[a.giverId];
      return [nameOf(a.giverId), event.codenamesEnabled ? (event.codenames[a.giverId] ?? '') : '', d?.link ?? '', d?.carriedFromVersion ?? draw.version, d?.issueNumber ?? '', d?.shared ? 'yes' : 'no'];
    }),
  ]);
}

export function linksText(event: ExchangeEvent, draw: DrawVersion, nameOf: (id: ID) => string): string {
  const lines = [`${event.name} — Draw version ${draw.version}`, ''];
  for (const a of draw.snapshot.assignments) {
    const d = draw.distribution[a.giverId];
    lines.push(`${nameOf(a.giverId)}:`, d?.link ?? '(link not generated yet)', '');
  }
  return lines.join('\n');
}
