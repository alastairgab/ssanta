import { z } from 'zod';
import type {
  DrawVersion,
  ExchangeEvent,
  ID,
  Participant,
  ParticipantWishlist,
  PublicWishlist,
} from '../types/models';
import type { AnswerLinkPayload, QuestionLinkPayload, RevealPayload, WishlistRequestPayload } from '../types/reveal';
import { CryptoError, openSealedJson, sealJson } from './cryptography';
import { nowIso } from '../utils/id';

/**
 * Self-contained participant links.
 *
 * Format:  <app-url>#<kind>=<formatVersion>.<ciphertext>.<key>
 *   kind:  r = reveal, q = anonymous question (for recipient), a = answer (for giver), w = wishlist request
 *
 * Everything after "#" is a URL fragment: browsers do not send it to GitHub Pages (or any server),
 * and it is not included in Referer headers. The key is unique per link, so one participant's link
 * can never decrypt another participant's assignment.
 */

export type LinkKind = 'r' | 'q' | 'a' | 'w';
export const LINK_FORMAT_VERSION = 1;

const KIND_AAD: Record<LinkKind, string> = { r: 'reveal', q: 'question', a: 'answer', w: 'wishlist-request' };

export interface ParsedFragment {
  kind: LinkKind;
  version: number;
  ciphertext: string;
  key: string;
}

export class LinkError extends Error {
  constructor(
    public code: 'missing' | 'malformed' | 'decrypt-failed' | 'unsupported-version' | 'invalid-content' | 'unsupported',
    message: string,
  ) {
    super(message);
    this.name = 'LinkError';
  }
}

/** Parse a location.hash. Returns null if the hash is not a participant link (e.g. organiser route). */
export function parseFragment(hash: string): ParsedFragment | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const m = /^([rqaw])=(.*)$/s.exec(raw);
  if (!m) return null;
  const kind = m[1] as LinkKind;
  let value: string;
  try {
    value = decodeURIComponent(m[2]!.trim()).replace(/\s+/g, '');
  } catch {
    throw new LinkError('malformed', 'This link looks damaged. Please check that you copied the whole link.');
  }
  const parts = value.split('.');
  if (parts.length !== 3) throw new LinkError('malformed', 'This link looks incomplete. Please check that you copied the whole link.');
  const version = Number(parts[0]);
  if (!Number.isInteger(version)) throw new LinkError('malformed', 'This link looks damaged.');
  if (version > LINK_FORMAT_VERSION) {
    throw new LinkError('unsupported-version', 'This link was made by a newer version of the app. Please reload the page to update.');
  }
  return { kind, version, ciphertext: parts[1]!, key: parts[2]! };
}

export function appBaseUrl(href = typeof location !== 'undefined' ? location.href : 'https://example.invalid/'): string {
  const u = new URL(href);
  u.hash = '';
  u.search = '';
  return u.toString();
}

async function makeLink(kind: LinkKind, payload: unknown, baseUrl: string): Promise<string> {
  const sealed = await sealJson(KIND_AAD[kind], payload);
  return `${baseUrl}#${kind}=${LINK_FORMAT_VERSION}.${sealed.ciphertext}.${sealed.key}`;
}

async function openLink<T>(fragment: ParsedFragment, expected: LinkKind, schema: z.ZodType<T>): Promise<T> {
  if (fragment.kind !== expected) throw new LinkError('malformed', 'This is a different kind of Secret Santa link.');
  let value: unknown;
  try {
    value = await openSealedJson(KIND_AAD[expected], fragment.ciphertext, fragment.key);
  } catch (e) {
    if (e instanceof CryptoError) {
      if (e.code === 'unsupported') throw new LinkError('unsupported', e.message);
      if (e.code === 'decrypt-failed') {
        throw new LinkError('decrypt-failed', 'This link could not be opened. It may have been cut off or changed when it was copied. Ask your organiser to send it again.');
      }
      throw new LinkError('malformed', 'This link looks damaged. Please check that you copied the whole link.');
    }
    throw new LinkError('malformed', 'This link could not be read.');
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new LinkError('invalid-content', 'This link opened, but its contents are not valid.');
  return parsed.data;
}

// ---------------------------------------------------------------------------
// Schemas (decrypted content is still validated before use)
// ---------------------------------------------------------------------------

const str = (max: number) => z.string().max(max);
const themeSchema = z.enum(['classic', 'present', 'advent', 'elegant']);
const jwkSchema = z.object({ kty: z.string().max(10), crv: z.string().max(10), x: z.string().max(100), y: z.string().max(100) }).passthrough();

export const publicWishlistSchema = z.object({
  interests: str(2000).optional(),
  hobbies: str(2000).optional(),
  retailers: str(2000).optional(),
  suggestions: str(4000).optional(),
  avoid: str(2000).optional(),
  sizes: str(1000).optional(),
  notes: str(4000).optional(),
  links: z.array(str(2000)).max(20).default([]),
});

export const revealPayloadSchema: z.ZodType<RevealPayload> = z.object({
  v: z.literal(1),
  eid: str(80),
  did: str(80),
  dv: z.number().int().min(1).max(100000),
  iss: z.number().int().min(1).max(100000),
  gid: str(80),
  g: str(200),
  gc: str(200).optional(),
  r: str(200),
  en: str(200),
  yr: z.number().int().min(1900).max(3000),
  th: themeSchema,
  greet: str(1000).optional(),
  date: str(40).optional(),
  bud: z.number().min(0).max(1e9).optional(),
  cur: str(10).optional(),
  loc: str(500).optional(),
  ins: str(2000).optional(),
  desc: str(2000).optional(),
  wl: publicWishlistSchema.optional(),
  rk: jwkSchema.optional(),
  at: str(40),
}) as unknown as z.ZodType<RevealPayload>;

const questionPayloadSchema: z.ZodType<QuestionLinkPayload> = z.object({
  v: z.literal(1),
  qid: str(80),
  eid: str(80),
  en: str(200),
  yr: z.number().int(),
  th: themeSchema,
  to: str(200),
  text: str(2000),
  rk: jwkSchema,
  at: str(40),
}) as unknown as z.ZodType<QuestionLinkPayload>;

const answerPayloadSchema: z.ZodType<AnswerLinkPayload> = z.object({
  v: z.literal(1),
  qid: str(80),
  en: str(200),
  yr: z.number().int(),
  th: themeSchema,
  q: str(2000),
  a: str(4000),
  from: str(200),
  at: str(40),
});

const wishlistRequestSchema: z.ZodType<WishlistRequestPayload> = z.object({
  v: z.literal(1),
  eid: str(80),
  en: str(200),
  yr: z.number().int(),
  th: themeSchema,
  pid: str(80),
  name: str(200),
  rk: jwkSchema,
  at: str(40),
}) as unknown as z.ZodType<WishlistRequestPayload>;

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

export function toPublicWishlist(w?: ParticipantWishlist): PublicWishlist | undefined {
  if (!w) return undefined;
  const pub: PublicWishlist = {
    interests: w.interests?.trim() || undefined,
    hobbies: w.hobbies?.trim() || undefined,
    retailers: w.retailers?.trim() || undefined,
    suggestions: w.suggestions?.trim() || undefined,
    avoid: w.avoid?.trim() || undefined,
    sizes: w.sizes?.trim() || undefined,
    notes: w.notes?.trim() || undefined,
    links: (w.links ?? []).map((l) => l.trim()).filter(Boolean),
  };
  const hasContent = Object.entries(pub).some(([k, v]) => (k === 'links' ? (v as string[]).length > 0 : Boolean(v)));
  return hasContent ? pub : undefined;
}

export interface RevealBuildInput {
  event: ExchangeEvent;
  draw: DrawVersion;
  giverId: ID;
  participants: Map<ID, Participant>;
  recipientWishlist?: ParticipantWishlist;
  issueNumber: number;
}

export function buildRevealPayload(input: RevealBuildInput): RevealPayload {
  const { event, draw, giverId } = input;
  const assignment = draw.snapshot.assignments.find((a) => a.giverId === giverId);
  if (!assignment) throw new Error('This participant has no assignment in the draw.');
  // Names come from the frozen snapshot so links always match the confirmed draw.
  const snapPerson = (id: ID) => draw.snapshot.participants.find((p) => p.id === id);
  const giver = snapPerson(giverId);
  const recipient = snapPerson(assignment.recipientId);
  if (!giver || !recipient) throw new Error('Draw snapshot is missing participant details.');
  const codename = event.codenamesEnabled ? (giver.codename ?? event.codenames[giverId]) : undefined;
  return {
    v: 1,
    eid: event.id,
    did: draw.id,
    dv: draw.version,
    iss: input.issueNumber,
    gid: giverId,
    g: giver.displayName,
    gc: codename || undefined,
    r: recipient.displayName,
    en: event.name,
    yr: event.year,
    th: event.theme,
    greet: event.greeting?.trim() || undefined,
    date: event.exchangeDate || undefined,
    bud: event.budget ?? undefined,
    cur: event.budget !== undefined ? event.currency : undefined,
    loc: event.location?.trim() || undefined,
    ins: event.instructions?.trim() || undefined,
    desc: event.description?.trim() || undefined,
    wl: event.includeWishlists ? toPublicWishlist(input.recipientWishlist) : undefined,
    rk: event.relayKeys?.publicKeyJwk,
    at: nowIso(),
  };
}

export const createRevealLink = (payload: RevealPayload, baseUrl = appBaseUrl()) => makeLink('r', payload, baseUrl);
export const createQuestionLink = (payload: QuestionLinkPayload, baseUrl = appBaseUrl()) => makeLink('q', payload, baseUrl);
export const createAnswerLink = (payload: AnswerLinkPayload, baseUrl = appBaseUrl()) => makeLink('a', payload, baseUrl);
export const createWishlistRequestLink = (payload: WishlistRequestPayload, baseUrl = appBaseUrl()) => makeLink('w', payload, baseUrl);

export const openRevealLink = (f: ParsedFragment) => openLink(f, 'r', revealPayloadSchema);
export const openQuestionLink = (f: ParsedFragment) => openLink(f, 'q', questionPayloadSchema);
export const openAnswerLink = (f: ParsedFragment) => openLink(f, 'a', answerPayloadSchema);
export const openWishlistRequestLink = (f: ParsedFragment) => openLink(f, 'w', wishlistRequestSchema);

/** Convenience for tests and previews: parse + open a full URL. */
export async function openRevealUrl(url: string): Promise<RevealPayload> {
  const hash = new URL(url).hash;
  const f = parseFragment(hash);
  if (!f) throw new LinkError('missing', 'Not a reveal link');
  return openRevealLink(f);
}
