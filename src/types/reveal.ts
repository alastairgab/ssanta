import type { ID, PublicWishlist, ThemeId } from './models';

/**
 * Plaintext content of a participant reveal link (before encryption).
 * Short keys keep links compact. Contains only what the giver needs —
 * never the full assignment matrix or anyone else's data.
 */
export interface RevealPayload {
  /**
   * Payload version. v1 links carried the event ID, giver ID and a timestamp; v2 (compact) links
   * drop those and identify the giver by their position `gi` in the draw snapshot, which the
   * organiser can always map back. Both versions remain readable.
   */
  v: 1 | 2;
  /** Event ID (v1 only). */
  eid?: ID;
  /** Draw ID / draw version / link issue number. */
  did: ID;
  dv: number;
  iss: number;
  /** Giver ID (v1) or giver index in the draw snapshot's participant list (v2). */
  gid?: ID;
  gi?: number;
  /** Giver display name + optional codename. */
  g: string;
  gc?: string;
  /** Recipient display name. */
  r: string;
  /** Event details. */
  en: string;
  yr: number;
  th: ThemeId;
  greet?: string;
  date?: string;
  bud?: number;
  cur?: string;
  loc?: string;
  ins?: string;
  desc?: string;
  /** Recipient's public wishlist (V2, optional). */
  wl?: PublicWishlist;
  /** Organiser relay public key (V2) so the giver can send encrypted anonymous questions. */
  rk?: JsonWebKey;
  /** Issued-at timestamp (v1 only). */
  at?: string;
}

/** Stable local key for a giver's own browser storage (checklist, question copies). */
export const giverStorageKey = (p: Pick<RevealPayload, 'did' | 'gid' | 'gi'>) => `${p.did}:${p.gid ?? `i${p.gi}`}`;

/** Payload of a recipient-facing anonymous question link. */
export interface QuestionLinkPayload {
  v: 1;
  qid: ID;
  eid: ID;
  en: string;
  yr: number;
  th: ThemeId;
  /** Recipient display name (so they know the link is meant for them). */
  to: string;
  text: string;
  rk: JsonWebKey;
  at: string;
}

/** Payload of a giver-facing answer link. */
export interface AnswerLinkPayload {
  v: 1;
  qid: ID;
  en: string;
  yr: number;
  th: ThemeId;
  q: string;
  a: string;
  /** Recipient display name. */
  from: string;
  at: string;
}

/** Payload of a wishlist request link (Workflow B). */
export interface WishlistRequestPayload {
  v: 1;
  eid: ID;
  en: string;
  yr: number;
  th: ThemeId;
  pid: ID;
  name: string;
  rk: JsonWebKey;
  at: string;
}

/** Packets sent from participants back to the organiser (encrypted to the organiser's relay key). */
export type RelayPacket =
  | { t: 'question'; v: 1; eid?: ID; did: ID; gid?: ID; gi?: number; qid: ID; text: string; at: string }
  | { t: 'reply'; v: 1; qid: ID; text: string; at: string }
  | { t: 'wishlist'; v: 1; eid: ID; pid: ID; name: string; wishlist: PublicWishlist; at: string };
