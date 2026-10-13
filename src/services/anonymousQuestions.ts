import { z } from 'zod';
import type { AnonymousQuestion, AnonymousReply, DrawVersion, ExchangeEvent, ID } from '../types/models';
import { CURRENT_SCHEMA_VERSION } from '../types/models';
import type { AnswerLinkPayload, QuestionLinkPayload, RelayPacket, RevealPayload } from '../types/reveal';
import { newId, nowIso } from '../utils/id';
import { decryptWithPrivateKey, encryptToPublicKey, CryptoError } from './cryptography';
import { createAnswerLink, createQuestionLink, publicWishlistSchema } from './revealLinks';

/**
 * Anonymous gift questions — a MANUAL relay that works without any server.
 *
 *   giver ──(encrypted packet, pasted into any chat)──▶ organiser ──(question link)──▶ recipient
 *   recipient ──(encrypted reply packet)──▶ organiser ──(answer link)──▶ giver
 *
 * Who can read what:
 *  - Question/reply packets are encrypted to the organiser's event key (ECDH P-256). Only the
 *    organiser's browser (holding the private key) can open them.
 *  - The organiser CAN see who asked: the packet includes the giver's ID so the answer can be routed
 *    back. Questions are anonymous to the RECIPIENT, not to the organiser.
 *  - The recipient's question link contains only the question text and event name — never the giver.
 *  - If the giver sends the packet from their own chat account, that platform shows the organiser
 *    who sent it; this is expected and doesn't affect anonymity towards the recipient.
 */

export const MAX_QUESTION_LENGTH = 1000;
export const MAX_REPLY_LENGTH = 2000;

export async function createQuestionPacket(reveal: RevealPayload, text: string): Promise<{ packet: string; qid: ID }> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Please write a question first.');
  if (trimmed.length > MAX_QUESTION_LENGTH) throw new Error(`Questions can be at most ${MAX_QUESTION_LENGTH} characters.`);
  if (!reveal.rk) throw new Error('This link does not support anonymous questions. Ask your organiser for an updated link.');
  const qid = newId('q');
  const packet: RelayPacket = { t: 'question', v: 1, eid: reveal.eid, did: reveal.did, gid: reveal.gid, qid, text: trimmed, at: nowIso() };
  return { packet: await encryptToPublicKey(reveal.rk, packet), qid };
}

export async function createReplyPacket(question: QuestionLinkPayload, text: string): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Please write a reply first.');
  if (trimmed.length > MAX_REPLY_LENGTH) throw new Error(`Replies can be at most ${MAX_REPLY_LENGTH} characters.`);
  const packet: RelayPacket = { t: 'reply', v: 1, qid: question.qid, text: trimmed, at: nowIso() };
  return encryptToPublicKey(question.rk, packet);
}

const id = z.string().min(1).max(100);
const packetSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('question'), v: z.literal(1), eid: id, did: id, gid: id, qid: id, text: z.string().min(1).max(MAX_QUESTION_LENGTH), at: z.string().max(40) }),
  z.object({ t: z.literal('reply'), v: z.literal(1), qid: id, text: z.string().min(1).max(MAX_REPLY_LENGTH), at: z.string().max(40) }),
  z.object({ t: z.literal('wishlist'), v: z.literal(1), eid: id, pid: id, name: z.string().max(200), wishlist: publicWishlistSchema, at: z.string().max(40) }),
]);

export class RelayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RelayError';
  }
}

/** Decrypt and validate a pasted relay packet for this event. */
export async function openRelayPacket(event: ExchangeEvent, pasted: string): Promise<RelayPacket> {
  if (!event.relayKeys) throw new RelayError('This event has no message key yet. Confirm a draw first.');
  let raw: unknown;
  try {
    raw = await decryptWithPrivateKey(event.relayKeys.privateKeyJwk, pasted);
  } catch (e) {
    throw new RelayError(e instanceof CryptoError ? e.message : 'The message could not be opened.');
  }
  const parsed = packetSchema.safeParse(raw);
  if (!parsed.success) throw new RelayError('The message opened, but its contents are not valid.');
  const packet = parsed.data as RelayPacket;
  if ((packet.t === 'question' || packet.t === 'wishlist') && packet.eid !== event.id) {
    throw new RelayError('This message belongs to a different event.');
  }
  return packet;
}

/** Turn a question packet into a stored question, resolving the recipient from the giver's draw. */
export function questionFromPacket(
  packet: Extract<RelayPacket, { t: 'question' }>,
  event: ExchangeEvent,
  draws: DrawVersion[],
): AnonymousQuestion {
  const draw = draws.find((d) => d.id === packet.did && d.eventId === event.id);
  if (!draw) throw new RelayError('This question refers to a draw that is not in this workspace.');
  const assignment = draw.snapshot.assignments.find((a) => a.giverId === packet.gid);
  if (!assignment) throw new RelayError('This question came from someone who is not in that draw.');
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: packet.qid,
    eventId: event.id,
    drawId: draw.id,
    giverId: packet.gid,
    recipientId: assignment.recipientId,
    text: packet.text,
    askedAt: packet.at,
    importedAt: nowIso(),
    forwardedToRecipient: false,
    status: 'received',
  };
}

export function replyFromPacket(packet: Extract<RelayPacket, { t: 'reply' }>, question: AnonymousQuestion | undefined): AnonymousReply {
  if (!question) throw new RelayError('This reply is for a question that is not in this workspace.');
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: newId('qr'),
    questionId: question.id,
    text: packet.text,
    repliedAt: packet.at,
    importedAt: nowIso(),
    returnedToGiver: false,
  };
}

export async function buildRecipientQuestionLink(event: ExchangeEvent, question: AnonymousQuestion, recipientName: string): Promise<string> {
  if (!event.relayKeys) throw new RelayError('This event has no message key.');
  const payload: QuestionLinkPayload = {
    v: 1,
    qid: question.id,
    eid: event.id,
    en: event.name,
    yr: event.year,
    th: event.theme,
    to: recipientName,
    text: question.text,
    rk: event.relayKeys.publicKeyJwk,
    at: nowIso(),
  };
  return createQuestionLink(payload);
}

export async function buildGiverAnswerLink(event: ExchangeEvent, question: AnonymousQuestion, reply: AnonymousReply, recipientName: string): Promise<string> {
  const payload: AnswerLinkPayload = { v: 1, qid: question.id, en: event.name, yr: event.year, th: event.theme, q: question.text, a: reply.text, from: recipientName, at: nowIso() };
  return createAnswerLink(payload);
}
