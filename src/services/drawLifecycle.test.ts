// @vitest-environment node
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  SantaDB,
  useDatabase,
  db,
  createSeries,
  createEvent,
  createParticipant,
  createHousehold,
  createNextYearEvent,
  updateDrawMetadata,
  loadHistory,
  addHistoryRecords,
  deleteParticipantIfUnused,
  deleteEvent,
} from './storage';
import {
  applyWithdrawalRepair,
  generateDraftDraw,
  importRelayMessage,
  issueLinks,
  planWithdrawal,
  setShared,
  confirmDraftDraw,
} from './eventOps';
import { computeDigest, computeIntegrity, verifyIntegrity } from './drawIntegrity';
import { compareAssignments, sharedCount } from './drawVersions';
import { openRevealUrl } from './revealLinks';
import { buildPlainBackup, decryptBackup, encryptBackup, importBackup, parseBackupFile, readWorkspace } from './backups';
import { createQuestionPacket, createReplyPacket, buildRecipientQuestionLink, buildGiverAnswerLink } from './anonymousQuestions';
import { openQuestionLink, openAnswerLink, parseFragment, createWishlistRequestLink, openWishlistRequestLink } from './revealLinks';
import { createWishlistSubmission, giversNeedingWishlistUpdate } from './wishlist';
import type { RepairResult } from './drawRepair';

let counter = 0;
beforeEach(() => {
  useDatabase(new SantaDB(`test-${Date.now()}-${counter++}`));
});

async function setup(names = ['Simba', 'Nala', 'Timon', 'Pumbaa', 'Rafiki']) {
  const series = await createSeries('Family Christmas');
  const people = [];
  for (const n of names) people.push(await createParticipant({ displayName: n }));
  const event = await createEvent({ seriesId: series.id, name: 'Family Christmas 2026', year: 2026, participantIds: people.map((p) => p.id), budget: 50 });
  return { series, people, event };
}

async function confirmedEvent() {
  const ctx = await setup();
  const gen = await generateDraftDraw(ctx.event.id);
  if (!gen.ok) throw new Error('draw failed');
  const draw = await confirmDraftDraw(ctx.event.id);
  return { ...ctx, draw };
}

describe('draw integrity fingerprints', () => {
  it('is deterministic and order-independent', async () => {
    const { draw } = await confirmedEvent();
    const shuffled = { ...draw.snapshot, assignments: [...draw.snapshot.assignments].reverse(), participants: [...draw.snapshot.participants].reverse() };
    expect(await computeDigest(draw.snapshot)).toBe(await computeDigest(shuffled));
    expect(await computeDigest(draw.snapshot)).toBe(draw.integrity!.digestHex);
    expect(draw.integrity!.shortFingerprint).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
  });

  it('changes when protected data changes', async () => {
    const { draw } = await confirmedEvent();
    const a = draw.snapshot.assignments;
    const tampered = { ...draw.snapshot, assignments: [{ ...a[0]!, recipientId: a[1]!.recipientId }, { ...a[1]!, recipientId: a[0]!.recipientId }, ...a.slice(2)] };
    expect((await computeIntegrity(tampered)).digestHex).not.toBe(draw.integrity!.digestHex);
    expect(await verifyIntegrity(draw.snapshot, draw.integrity!.shortFingerprint)).toBe(true);
    expect(await verifyIntegrity(tampered, draw.integrity!.shortFingerprint)).toBe(false);
  });
});

describe('draw lifecycle & versioning', () => {
  it('generates, confirms and freezes a draw', async () => {
    const { event, draw } = await confirmedEvent();
    expect(draw.status).toBe('confirmed');
    expect(draw.version).toBe(1);
    const ev = await db.events.get(event.id);
    expect(ev!.status).toBe('draw-confirmed');
    expect(ev!.activeDrawId).toBe(draw.id);
    expect(ev!.relayKeys).toBeDefined();
    await expect(
      updateDrawMetadata(draw.id, (d) => {
        d.snapshot.assignments[0]!.recipientId = 'someone-else';
        return d;
      }),
    ).rejects.toThrow(/immutable/);
    // Metadata changes are allowed
    await updateDrawMetadata(draw.id, (d) => ({ ...d, note: 'hello' }));
  });

  it('regenerating a draft does not create versions; confirming a redraw creates v2 and supersedes v1', async () => {
    const { event, draw } = await confirmedEvent();
    await generateDraftDraw(event.id);
    await generateDraftDraw(event.id);
    const drafts = (await db.draws.toArray()).filter((d) => d.status === 'draft');
    expect(drafts).toHaveLength(1);
    const v2 = await confirmDraftDraw(event.id);
    expect(v2.version).toBe(2);
    expect(v2.reason).toBe('redraw');
    const v1 = await db.draws.get(draw.id);
    expect(v1!.status).toBe('superseded');
    expect(v1!.snapshot).toEqual(draw.snapshot); // untouched
    const cmp = compareAssignments(v1!.snapshot.assignments, v2.snapshot.assignments);
    expect(cmp.changed.length + cmp.unchanged.length).toBe(5);
  });

  it('issues links, tracks sharing separately, and reports shared counts', async () => {
    const { event, draw } = await confirmedEvent();
    const withLinks = await issueLinks(event.id, draw.id, 'all', 'initial');
    expect(Object.values(withLinks.distribution).every((d) => d.link && d.shared === false)).toBe(true);
    expect((await db.events.get(event.id))!.status).toBe('links-ready');
    expect((await db.draws.get(draw.id))!.status).toBe('active');
    const givers = draw.snapshot.assignments.map((a) => a.giverId);
    await setShared(draw.id, givers.slice(0, 3), true);
    expect(sharedCount(await db.draws.get(draw.id))).toBe(3);
    // Link decrypts to the right assignment
    const a = draw.snapshot.assignments[0]!;
    const link = (await db.draws.get(draw.id))!.distribution[a.giverId]!.link!;
    const payload = await openRevealUrl(link);
    const recipientName = draw.snapshot.participants.find((p) => p.id === a.recipientId)!.displayName;
    expect(payload.r).toBe(recipientName);
    expect(payload.dv).toBe(1);
    // Re-issuing a link bumps the issue number and resets "shared"
    const reissued = await issueLinks(event.id, draw.id, [a.giverId], 'reissue');
    expect(reissued.distribution[a.giverId]!.issueNumber).toBe(2);
    expect(reissued.distribution[a.giverId]!.shared).toBe(false);
  });

  it('history comes from confirmed draws and is used next year', async () => {
    const { event, draw } = await confirmedEvent();
    const next = await createNextYearEvent(event.id);
    expect(next.year).toBe(2027);
    expect(next.name).toBe('Family Christmas 2027');
    expect(next.activeDrawId).toBeUndefined();
    const hist = await loadHistory(next.id);
    expect(hist).toHaveLength(5);
    expect(hist.every((h) => h.year === 2026)).toBe(true);
    const gen = await generateDraftDraw(next.id);
    expect(gen.ok).toBe(true);
    if (gen.ok) {
      const prev = new Map(draw.snapshot.assignments.map((a) => [a.giverId, a.recipientId]));
      for (const a of gen.draw.snapshot.assignments) expect(prev.get(a.giverId)).not.toBe(a.recipientId);
    }
  });

  it('impossible configurations return a diagnosis instead of a draw', async () => {
    const { people, event } = await setup(['A1', 'A2', 'A3', 'B1']);
    await createHousehold('Household A', people.slice(0, 3).map((p) => p.id));
    const gen = await generateDraftDraw(event.id);
    expect(gen.ok).toBe(false);
    if (!gen.ok) {
      expect(gen.diagnosis.feasible).toBe(false);
      expect(gen.diagnosis.remedies.length).toBeGreaterThan(0);
    }
  });

  it('participants with records are deactivated, not deleted', async () => {
    const { people } = await confirmedEvent();
    expect(await deleteParticipantIfUnused(people[0]!.id)).toBe('deactivated');
    expect((await db.participants.get(people[0]!.id))!.active).toBe(false);
    const lonely = await createParticipant({ displayName: 'New person' });
    expect(await deleteParticipantIfUnused(lonely.id)).toBe('deleted');
  });

  it('deleting an event can keep its assignments as history', async () => {
    const { event } = await confirmedEvent();
    await deleteEvent(event.id, true);
    expect(await db.history.count()).toBe(5);
    expect(await db.draws.count()).toBe(0);
  });
});

describe('withdrawal repair', () => {
  it('repairs with minimal changes and creates a new version, keeping unchanged links', async () => {
    const { event, draw } = await confirmedEvent();
    await issueLinks(event.id, draw.id, 'all', 'initial');
    // Pick someone who is NOT in a two-person swap (with 5 people at least one such person exists).
    const rec = new Map(draw.snapshot.assignments.map((a) => [a.giverId, a.recipientId]));
    const leaving = draw.snapshot.assignments.find((a) => rec.get(a.recipientId) !== a.giverId)!.giverId;
    const { result } = await planWithdrawal(event.id, [leaving]);
    const r = result as RepairResult;
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Withdrawing one person from a cycle of 3+ needs exactly one change: their giver takes their recipient.
    expect(r.repair.changed).toHaveLength(1);
    expect(r.repair.solver.provenOptimal).toBe(true);
    const v2 = await applyWithdrawalRepair(event.id, r.repair, 'Flu');
    expect(v2.version).toBe(2);
    expect(v2.reason).toBe('withdrawal-repair');
    expect(v2.snapshot.assignments).toHaveLength(4);
    expect(v2.snapshot.participants.some((p) => p.id === leaving)).toBe(false);
    const carried = Object.values(v2.distribution).filter((d) => d.carriedFromVersion === 1);
    expect(carried).toHaveLength(3);
    expect((await db.draws.get(draw.id))!.status).toBe('superseded');
    expect((await db.events.get(event.id))!.participantIds).not.toContain(leaving);
  });

  it('respects constraints during repair (reciprocal)', async () => {
    const { event, draw } = await confirmedEvent();
    await db.events.update(event.id, { rules: { ...(await db.events.get(event.id))!.rules, preventReciprocal: true } });
    const { result } = await planWithdrawal(event.id, [draw.snapshot.assignments[0]!.giverId]);
    const r = result as RepairResult;
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const map = new Map(r.repair.proposed.map((a) => [a.giverId, a.recipientId]));
    for (const [g, rcp] of map) {
      expect(g).not.toBe(rcp);
      expect(map.get(rcp)).not.toBe(g);
    }
  });
});

describe('anonymous questions & wishlist relay', () => {
  it('runs the full manual relay without revealing the giver to the recipient', async () => {
    const { event, draw } = await confirmedEvent();
    const issued = await issueLinks(event.id, draw.id, 'all', 'initial');
    const a = draw.snapshot.assignments[0]!;
    const reveal = await openRevealUrl(issued.distribution[a.giverId]!.link!);
    expect(reveal.rk).toBeDefined();
    const { packet } = await createQuestionPacket(reveal, 'What books do you like?');
    const imported = await importRelayMessage(event.id, `Hi organiser! ${packet}`);
    expect(imported.type).toBe('question');
    const dup = await importRelayMessage(event.id, packet);
    expect(dup).toMatchObject({ duplicate: true });
    const q = (await db.questions.get(imported.type === 'question' ? imported.questionId : ''))!;
    expect(q.recipientId).toBe(a.recipientId);
    const ev = (await db.events.get(event.id))!;
    const recipientName = draw.snapshot.participants.find((p) => p.id === a.recipientId)!.displayName;
    const giverName = draw.snapshot.participants.find((p) => p.id === a.giverId)!.displayName;
    const qLink = await buildRecipientQuestionLink(ev, q, recipientName);
    const qPayload = await openQuestionLink(parseFragment(new URL(qLink).hash)!);
    expect(qPayload.text).toBe('What books do you like?');
    expect(JSON.stringify(qPayload)).not.toContain(giverName);
    expect(JSON.stringify(qPayload)).not.toContain(a.giverId);
    const replyPacket = await createReplyPacket(qPayload, 'Fantasy please!');
    const rep = await importRelayMessage(event.id, replyPacket);
    expect(rep.type).toBe('reply');
    const reply = (await db.replies.where('questionId').equals(q.id).first())!;
    const aLink = await buildGiverAnswerLink(ev, q, reply, recipientName);
    const ans = await openAnswerLink(parseFragment(new URL(aLink).hash)!);
    expect(ans.a).toBe('Fantasy please!');
    expect(ans.q).toBe('What books do you like?');
  });

  it('rejects corrupted or foreign relay messages', async () => {
    const { event } = await confirmedEvent();
    await expect(importRelayMessage(event.id, 'SECRET-SANTA-PACKET:1:AAAA')).rejects.toThrow();
    const other = await confirmedEvent();
    const ev2 = (await db.events.get(other.event.id))!;
    const reqLink = await createWishlistRequestLink({ v: 1, eid: ev2.id, en: ev2.name, yr: 2026, th: 'classic', pid: other.people[0]!.id, name: 'Simba', rk: ev2.relayKeys!.publicKeyJwk, at: '' });
    const req = await openWishlistRequestLink(parseFragment(new URL(reqLink).hash)!);
    const sub = await createWishlistSubmission(req, { interests: 'Lego', links: ['javascript:alert(1)', 'https://shop.example/item'] });
    await expect(importRelayMessage(event.id, sub)).rejects.toThrow();
  });

  it('wishlist submissions import, sanitise links, and flag givers needing replacement links', async () => {
    const { event, draw, people } = await confirmedEvent();
    await issueLinks(event.id, draw.id, 'all', 'initial');
    const ev = (await db.events.get(event.id))!;
    const target = people[1]!;
    const reqLink = await createWishlistRequestLink({ v: 1, eid: ev.id, en: ev.name, yr: 2026, th: 'classic', pid: target.id, name: target.displayName, rk: ev.relayKeys!.publicKeyJwk, at: '' });
    const req = await openWishlistRequestLink(parseFragment(new URL(reqLink).hash)!);
    await new Promise((r) => setTimeout(r, 5));
    const sub = await createWishlistSubmission(req, { interests: 'Lego', links: ['javascript:alert(1)', 'https://shop.example/item'] });
    const res = await importRelayMessage(event.id, sub);
    expect(res.type).toBe('wishlist');
    const w = (await db.wishlists.toArray())[0]!;
    expect(w.links).toEqual(['https://shop.example/item']);
    const d = (await db.draws.get(draw.id))!;
    const needing = giversNeedingWishlistUpdate(ev, d, [w]);
    const giverOfTarget = d.snapshot.assignments.find((a) => a.recipientId === target.id)!.giverId;
    expect(needing).toEqual([giverOfTarget]);
    const updated = await issueLinks(event.id, draw.id, needing, 'wishlist-update');
    const payload = await openRevealUrl(updated.distribution[giverOfTarget]!.link!);
    expect(payload.wl?.interests).toBe('Lego');
    expect(giversNeedingWishlistUpdate(ev, updated, [w])).toEqual([]);
  });
});

describe('backups', () => {
  it('exports and restores a complete workspace including draw versions', async () => {
    const { event } = await confirmedEvent();
    await generateDraftDraw(event.id);
    await confirmDraftDraw(event.id);
    await addHistoryRecords([{ seriesId: event.seriesId, year: 2020, giverId: (await db.participants.toArray())[0]!.id, recipientId: (await db.participants.toArray())[1]!.id, source: 'manual' }]);
    const data = await readWorkspace();
    const plain = buildPlainBackup(data, true);
    expect(plain.manifest.containsAssignments).toBe(true);
    const enc = await encryptBackup(plain, 'a long password', 100_000);
    const text = JSON.stringify(enc);
    expect(text).not.toContain('Simba');
    const parsed = parseBackupFile(text);
    expect(parsed.kind).toBe('encrypted');
    if (parsed.kind !== 'encrypted') return;
    await expect(decryptBackup(parsed.backup, 'wrong password')).rejects.toThrow();
    const restored = await decryptBackup(parsed.backup, 'a long password');

    useDatabase(new SantaDB(`restore-${Date.now()}`));
    await importBackup(restored, 'replace');
    const draws = await db.draws.toArray();
    expect(draws).toHaveLength(2);
    expect(draws.map((d) => d.status).sort()).toEqual(['confirmed', 'superseded']);
    for (const d of draws) expect(await computeDigest(d.snapshot)).toBe(d.integrity!.digestHex);
    expect(await db.history.count()).toBe(1);
  });

  it('merge mode never overwrites existing records', async () => {
    const { event } = await confirmedEvent();
    const backup = buildPlainBackup(await readWorkspace(), true);
    await db.events.update(event.id, { name: 'Renamed locally' });
    const summary = await importBackup(backup, 'merge');
    expect(summary.conflicts.events).toBe(1);
    expect((await db.events.get(event.id))!.name).toBe('Renamed locally');
  });

  it('setup-only export strips assignments', async () => {
    await confirmedEvent();
    const backup = buildPlainBackup(await readWorkspace(), false);
    expect(backup.data.draws).toHaveLength(0);
    expect(backup.manifest.containsAssignments).toBe(false);
    expect(backup.data.events[0]!.relayKeys).toBeUndefined();
  });

  it('rejects invalid or hostile backup files with clear errors', () => {
    expect(() => parseBackupFile('not json')).toThrow(/not JSON/);
    expect(() => parseBackupFile('{}')).toThrow(/not a Secret Santa backup/);
    const bad = { manifest: { format: 'secret-santa-backup', schemaVersion: 1, appVersion: '2', exportedAt: '', containsAssignments: false, encrypted: false, counts: {} }, data: { participants: [{ id: 1 }] } };
    expect(() => parseBackupFile(JSON.stringify(bad))).toThrow(/invalid data/);
    const future = { ...bad, manifest: { ...bad.manifest, schemaVersion: 99 } };
    expect(() => parseBackupFile(JSON.stringify(future))).toThrow(/newer version/);
  });
});
