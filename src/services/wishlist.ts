import type { DrawVersion, ExchangeEvent, ID, ParticipantWishlist, PublicWishlist } from '../types/models';
import { CURRENT_SCHEMA_VERSION } from '../types/models';
import type { RelayPacket, WishlistRequestPayload } from '../types/reveal';
import { nowIso } from '../utils/id';
import { encryptToPublicKey } from './cryptography';
import { publicWishlistSchema } from './revealLinks';

/**
 * Wishlists (Version 2)
 *
 * Workflow A — organiser-managed: the organiser types/imports wishlists; when links are generated,
 *   each giver's link contains ONLY their recipient's public wishlist fields (never organiser notes,
 *   never anyone else's wishlist).
 * Workflow B — participant submissions: the organiser sends a wishlist request link; the participant
 *   fills a form and gets an encrypted message (encrypted to the organiser's event key) to paste back
 *   to the organiser by any chat app. The organiser imports it. Already-distributed reveal links do
 *   NOT update by themselves — the organiser issues replacement links for affected givers.
 */

export const wishlistId = (eventId: ID, participantId: ID) => `${eventId}:${participantId}`;

export function emptyWishlist(eventId: ID, participantId: ID): ParticipantWishlist {
  return { schemaVersion: CURRENT_SCHEMA_VERSION, id: wishlistId(eventId, participantId), eventId, participantId, links: [], source: 'organiser', updatedAt: nowIso() };
}

/** Allow only http(s) product links; anything else (javascript:, data:, …) is rejected. */
export function safeExternalUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function cleanLinks(links: string[]): string[] {
  return links
    .map((l) => safeExternalUrl(l))
    .filter((l): l is string => Boolean(l))
    .slice(0, 20);
}

export async function createWishlistSubmission(request: WishlistRequestPayload, wishlist: PublicWishlist): Promise<string> {
  const clean = publicWishlistSchema.parse({ ...wishlist, links: cleanLinks(wishlist.links ?? []) });
  const packet: RelayPacket = { t: 'wishlist', v: 1, eid: request.eid, pid: request.pid, name: request.name, wishlist: clean, at: nowIso() };
  return encryptToPublicKey(request.rk, packet);
}

export function applyWishlistSubmission(existing: ParticipantWishlist | undefined, eventId: ID, participantId: ID, wl: PublicWishlist): ParticipantWishlist {
  const base = existing ?? emptyWishlist(eventId, participantId);
  return {
    ...base,
    interests: wl.interests,
    hobbies: wl.hobbies,
    retailers: wl.retailers,
    suggestions: wl.suggestions,
    avoid: wl.avoid,
    sizes: wl.sizes,
    notes: wl.notes,
    links: cleanLinks(wl.links ?? []),
    source: 'submission',
    updatedAt: nowIso(),
  };
}

/**
 * Givers whose current link was issued before their recipient's wishlist last changed
 * (so their link shows an outdated wishlist and a replacement link may be wanted).
 */
export function giversNeedingWishlistUpdate(event: ExchangeEvent, draw: DrawVersion | undefined, wishlists: ParticipantWishlist[]): ID[] {
  if (!draw || !event.includeWishlists) return [];
  const byPerson = new Map(wishlists.filter((w) => w.eventId === event.id).map((w) => [w.participantId, w]));
  return draw.snapshot.assignments
    .filter((a) => {
      const w = byPerson.get(a.recipientId);
      const d = draw.distribution[a.giverId];
      if (!w || !d?.link || !d.issuedAt) return false;
      return w.updatedAt > d.issuedAt;
    })
    .map((a) => a.giverId);
}
