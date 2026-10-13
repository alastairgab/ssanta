import { useState } from 'react';
import { Icon } from '../../components/ui/icons';
import { Badge, Callout, Card, CopyButton, Modal, SectionTitle, TextArea, TextInput, Toggle, useAsyncAction, useToast } from '../../components/ui/ui';
import { RelayInbox } from '../../components/RelayInbox';
import { useWishlists } from '../../hooks/useData';
import { generateRelayKeyPair } from '../../services/cryptography';
import { createWishlistRequestLink } from '../../services/revealLinks';
import { db, updateEvent } from '../../services/storage';
import { cleanLinks, emptyWishlist, giversNeedingWishlistUpdate, wishlistId } from '../../services/wishlist';
import type { ID, ParticipantWishlist } from '../../types/models';
import { nowIso } from '../../utils/id';
import { formatDateTime } from '../../utils/format';
import type { EventCtx } from './EventWorkspace';
import { href } from '../../app/router';

const FIELDS: { key: keyof ParticipantWishlist; label: string; long?: boolean }[] = [
  { key: 'interests', label: 'Interests' },
  { key: 'hobbies', label: 'Hobbies' },
  { key: 'retailers', label: 'Favourite shops' },
  { key: 'suggestions', label: 'Gift ideas', long: true },
  { key: 'avoid', label: 'Please avoid' },
  { key: 'sizes', label: 'Sizes (optional)' },
  { key: 'notes', label: 'Other notes', long: true },
];

function WishlistEditor({ eventId, personId, name, existing, onClose }: { eventId: ID; personId: ID; name: string; existing?: ParticipantWishlist; onClose: () => void }) {
  const [w, setW] = useState<ParticipantWishlist>(existing ?? emptyWishlist(eventId, personId));
  const [links, setLinks] = useState((existing?.links ?? []).join('\n'));
  const toast = useToast();
  return (
    <Modal
      open
      onClose={onClose}
      title={`${name}'s wishlist`}
      size="lg"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={async () => {
              const raw = links.split(/\s+/).filter(Boolean);
              const clean = cleanLinks(raw);
              await db.wishlists.put({ ...w, links: clean, source: existing?.source ?? 'organiser', updatedAt: nowIso() });
              if (clean.length < raw.length) toast('Some links were skipped (only http/https web links are allowed).', 'info');
              else toast('Wishlist saved');
              onClose();
            }}
          >
            Save
          </button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map((f) =>
          f.long ? (
            <div key={f.key} className="sm:col-span-2">
              <TextArea label={f.label} value={(w[f.key] as string) ?? ''} onChange={(e) => setW({ ...w, [f.key]: e.target.value })} maxLength={4000} />
            </div>
          ) : (
            <TextInput key={f.key} label={f.label} value={(w[f.key] as string) ?? ''} onChange={(e) => setW({ ...w, [f.key]: e.target.value })} maxLength={2000} />
          ),
        )}
        <div className="sm:col-span-2">
          <TextArea label="Product links (one per line)" value={links} onChange={(e) => setLinks(e.target.value)} hint="Only https:// or http:// links are kept." />
        </div>
        <div className="sm:col-span-2">
          <TextArea label="Organiser-only notes" value={w.organiserNotes ?? ''} onChange={(e) => setW({ ...w, organiserNotes: e.target.value })} hint="Never included in anyone’s link." />
        </div>
      </div>
    </Modal>
  );
}

export default function WishlistsPage({ ctx }: { ctx: EventCtx }) {
  const { event, members, nameOf, activeDraw } = ctx;
  const wishlists = useWishlists(event.id) ?? [];
  const [editing, setEditing] = useState<ID | null>(null);
  const [requestLinks, setRequestLinks] = useState<Record<ID, string>>({});
  const { busy, run } = useAsyncAction();
  const byPerson = new Map(wishlists.map((w) => [w.participantId, w]));
  const outdated = giversNeedingWishlistUpdate(event, activeDraw, wishlists);

  const makeRequestLink = async (pid: ID) => {
    let ev = (await db.events.get(event.id))!;
    if (!ev.relayKeys) {
      await updateEvent(event.id, { relayKeys: { ...(await generateRelayKeyPair()), createdAt: nowIso() } });
      ev = (await db.events.get(event.id))!;
    }
    const link = await createWishlistRequestLink({ v: 1, eid: ev.id, en: ev.name, yr: ev.year, th: ev.theme, pid, name: nameOf(pid), rk: ev.relayKeys!.publicKeyJwk, at: nowIso() });
    setRequestLinks((s) => ({ ...s, [pid]: link }));
  };

  return (
    <div className="space-y-6">
      <Card>
        <SectionTitle
          title="Wishlists"
          description="Each giver’s link includes only their own recipient’s wishlist — never anyone else’s, and never your organiser-only notes."
        />
        <Toggle checked={event.includeWishlists} onChange={(v) => void updateEvent(event.id, { includeWishlists: v })} label="Include the recipient’s wishlist in reveal links" />
        {outdated.length > 0 ? (
          <Callout tone="warning" className="mt-4" title={`${outdated.length} sent link(s) show an older wishlist`}>
            Links don’t update themselves. Go to <a className="font-semibold underline" href={href(`events/${event.id}/share`)}>Share links</a> to create updated links for those givers.
          </Callout>
        ) : null}
      </Card>

      <Card>
        <SectionTitle title="Two ways to collect wishlists" />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl bg-pine-50 p-4 text-sm">
            <p className="font-semibold">A. You fill them in</p>
            <p className="mt-1 text-pine-700">Simplest. Use “Edit” below before you create links.</p>
          </div>
          <div className="rounded-xl bg-pine-50 p-4 text-sm">
            <p className="font-semibold">B. Participants send their own</p>
            <p className="mt-1 text-pine-700">
              Send someone their “wishlist request” link. They fill in a form and get an encrypted message to send back to you. Paste it in the inbox below. There’s no server, so nothing arrives automatically.
            </p>
          </div>
        </div>
      </Card>

      <RelayInbox eventId={event.id} />

      <Card>
        <ul className="divide-y divide-pine-100">
          {members.map((m) => {
            const w = byPerson.get(m.id);
            return (
              <li key={m.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{nameOf(m.id)}</p>
                  <p className="text-xs text-pine-700">
                    {w ? (
                      <>
                        <Badge tone={w.source === 'submission' ? 'blue' : 'neutral'}>{w.source === 'submission' ? 'Sent by participant' : 'Entered by you'}</Badge> updated {formatDateTime(w.updatedAt)}
                      </>
                    ) : (
                      'No wishlist yet'
                    )}
                  </p>
                  {requestLinks[m.id] ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <code className="max-w-full truncate rounded bg-pine-50 px-2 py-1 text-xs">{requestLinks[m.id]}</code>
                      <CopyButton text={`Hi ${m.displayName}! Please fill in your Secret Santa wishlist for ${event.name} here, then send me the message it gives you:\n${requestLinks[m.id]}`} label="Copy request" />
                    </div>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <button type="button" className="btn-secondary btn-sm" onClick={() => setEditing(m.id)}>
                    <Icon.Edit className="h-4 w-4" /> {w ? 'Edit' : 'Add'}
                  </button>
                  <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => void run(() => makeRequestLink(m.id))}>
                    <Icon.Link className="h-4 w-4" /> Request link
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
      {editing ? <WishlistEditor eventId={event.id} personId={editing} name={nameOf(editing)} existing={byPerson.get(editing) ?? (wishlists.find((w) => w.id === wishlistId(event.id, editing)))} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}
