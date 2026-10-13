import { useMemo, useState } from 'react';
import { href } from '../../app/router';
import { Icon } from '../../components/ui/icons';
import { Badge, Callout, Card, ConfirmDialog, CopyButton, SectionTitle, Spinner, TextArea, useAsyncAction, useToast } from '../../components/ui/ui';
import { QrModal } from '../../components/distribution/QrModal';
import { useWishlists } from '../../hooks/useData';
import { linksCsv, linksText } from '../../services/csvImport';
import { issueLinks, setShared } from '../../services/eventOps';
import { DEFAULT_INVITATION, DEFAULT_REPLACEMENT, renderInvitation } from '../../services/invitations';
import { updateEvent } from '../../services/storage';
import { giversNeedingWishlistUpdate } from '../../services/wishlist';
import type { ID } from '../../types/models';
import { downloadText, safeFilename } from '../../utils/download';
import { formatDateTime, plural } from '../../utils/format';
import type { EventCtx } from './EventWorkspace';

export default function ShareStep({ ctx }: { ctx: EventCtx }) {
  const { event, activeDraw: draw, nameOf } = ctx;
  const wishlists = useWishlists(event.id);
  const { busy, run } = useAsyncAction();
  const toast = useToast();
  const [qr, setQr] = useState<{ link: string; name: string } | null>(null);
  const [reissue, setReissue] = useState<ID | null>(null);
  const [template, setTemplate] = useState(event.invitationTemplate ?? DEFAULT_INVITATION);

  const parent = useMemo(() => ctx.draws.find((d) => d.id === draw?.parentDrawId), [ctx.draws, draw]);
  const needWishlist = useMemo(() => new Set(giversNeedingWishlistUpdate(event, draw, wishlists ?? [])), [event, draw, wishlists]);

  if (!draw) {
    return (
      <Callout title="No confirmed draw yet">
        Generate and confirm a draw first. <a className="font-semibold underline" href={href(`events/${event.id}/draw`)}>Go to Draw & confirm</a>.
      </Callout>
    );
  }
  if (draw.status === 'archived' || event.status === 'archived') {
    return <Callout title="This exchange is archived">Links are kept below for reference. Unarchive in Settings to issue new ones.</Callout>;
  }

  const rows = [...draw.snapshot.assignments].sort((a, b) => nameOf(a.giverId).localeCompare(nameOf(b.giverId)));
  const withLinks = rows.filter((a) => draw.distribution[a.giverId]?.link);
  const missing = rows.filter((a) => !draw.distribution[a.giverId]?.link).map((a) => a.giverId);
  const sharedN = rows.filter((a) => draw.distribution[a.giverId]?.shared).length;

  const isReplacement = (giverId: ID) => {
    const d = draw.distribution[giverId];
    if (!d) return false;
    const last = d.issues[d.issues.length - 1]?.reason;
    if (last === 'replacement' || last === 'wishlist-update') return true;
    return Boolean(parent?.distribution[giverId]?.link) && !d.carriedFromDrawId;
  };

  const messageFor = (giverId: ID) => {
    const d = draw.distribution[giverId]!;
    const replacement = isReplacement(giverId);
    return renderInvitation(replacement ? DEFAULT_REPLACEMENT : template, event, {
      name: nameOf(giverId),
      link: d.link!,
      codename: event.codenamesEnabled ? event.codenames[giverId] : undefined,
      version: d.carriedFromVersion ?? draw.version,
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <SectionTitle
          title={`Personal links · Draw v${draw.version}`}
          description={
            <>
              Send each person their own link through any app you like. Each link is encrypted separately and only reveals that person’s match. Sharing status is
              tracked manually — the app can’t tell whether someone has opened their link.
            </>
          }
          action={
            withLinks.length > 0 ? (
              <>
                <button type="button" className="btn-secondary btn-sm" onClick={() => downloadText(linksCsv(event, draw, nameOf), `${safeFilename(event.name)}-links-v${draw.version}.csv`, 'text/csv;charset=utf-8')}>
                  <Icon.Save className="h-4 w-4" /> CSV
                </button>
                <button type="button" className="btn-secondary btn-sm" onClick={() => downloadText(linksText(event, draw, nameOf), `${safeFilename(event.name)}-links-v${draw.version}.txt`)}>
                  <Icon.Save className="h-4 w-4" /> Text
                </button>
                <button type="button" className="btn-secondary btn-sm" disabled={sharedN === withLinks.length} onClick={() => void setShared(draw.id, withLinks.map((a) => a.giverId), true)}>
                  <Icon.Check className="h-4 w-4" /> Mark all shared
                </button>
              </>
            ) : null
          }
        />
        {missing.length > 0 ? (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-gold-100 p-4">
            <p className="text-sm">
              <strong>{plural(missing.length, 'person needs', 'people need')} a link.</strong> {withLinks.length === 0 ? 'Create everyone’s encrypted link now.' : 'Their assignment changed, so create a replacement link.'}
            </p>
            <button
              type="button"
              className="btn-primary"
              disabled={busy}
              onClick={() => void run(() => issueLinks(event.id, draw.id, missing, withLinks.length === 0 ? 'initial' : 'replacement'), 'Links created')}
            >
              {busy ? 'Encrypting…' : `Create ${plural(missing.length, 'link')}`}
            </button>
          </div>
        ) : null}
        {busy ? <Spinner label="Encrypting links…" /> : null}
        {needWishlist.size > 0 ? (
          <Callout tone="warning" className="mb-4" title="Wishlists changed after links were sent">
            {plural(needWishlist.size, 'giver')}’ links show an older wishlist. Links don’t update by themselves — create new ones to include the latest wishlist.{' '}
            <button type="button" className="font-semibold underline" onClick={() => void run(() => issueLinks(event.id, draw.id, Array.from(needWishlist), 'wishlist-update'), 'Updated links created')}>
              Create updated links
            </button>
          </Callout>
        ) : null}

        <p className="mb-2 text-sm font-medium text-pine-700" aria-live="polite">
          {sharedN} of {rows.length} marked as shared
        </p>
        <ul className="divide-y divide-pine-100">
          {rows.map((a) => {
            const d = draw.distribution[a.giverId];
            const name = nameOf(a.giverId);
            return (
              <li key={a.giverId} className="flex flex-col gap-3 py-4 md:flex-row md:items-center">
                <div className="min-w-0 flex-1">
                  <p className="break-words font-semibold">
                    {name}
                    {event.codenamesEnabled && event.codenames[a.giverId] ? <span className="ml-2 text-xs font-normal text-pine-600">“{event.codenames[a.giverId]}”</span> : null}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                    {d?.link ? (
                      <>
                        <Badge tone="neutral">
                          Link #{d.issueNumber} · v{d.carriedFromVersion ?? draw.version}
                        </Badge>
                        {d.carriedFromVersion ? <Badge tone="blue" title="This person's assignment didn't change in the repair, so their earlier link is still correct.">Still valid from v{d.carriedFromVersion}</Badge> : null}
                        {isReplacement(a.giverId) ? <Badge tone="gold">Replacement</Badge> : null}
                        {needWishlist.has(a.giverId) ? <Badge tone="gold">Wishlist out of date</Badge> : null}
                        <span className="text-pine-500">Created {formatDateTime(d.issuedAt)}</span>
                      </>
                    ) : (
                      <Badge tone="red">No link yet</Badge>
                    )}
                  </div>
                </div>
                {d?.link ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <label className="mr-2 inline-flex cursor-pointer items-center gap-2 text-sm font-medium">
                      <input type="checkbox" className="h-5 w-5 accent-pine-700" checked={d.shared} onChange={(e) => void setShared(draw.id, [a.giverId], e.target.checked)} />
                      Shared
                    </label>
                    <CopyButton text={d.link} label="Copy link" />
                    <CopyButton text={() => messageFor(a.giverId)} label={isReplacement(a.giverId) ? 'Copy update msg' : 'Copy invite'} />
                    <a className="btn-ghost btn-sm" href={d.link} target="_blank" rel="noopener noreferrer" title={`Opens ${name}'s reveal page — you will see who they're buying for`}>
                      <Icon.Eye className="h-4 w-4" /> Preview
                    </a>
                    <button type="button" className="btn-ghost btn-sm" onClick={() => setQr({ link: d.link!, name })}>
                      <Icon.Qr className="h-4 w-4" /> QR
                    </button>
                    <button type="button" className="btn-ghost btn-sm" onClick={() => setReissue(a.giverId)} title="Create a fresh link">
                      <Icon.Refresh className="h-4 w-4" />
                      <span className="sr-only">Create a new link for {name}</span>
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Card>

      <Card>
        <SectionTitle title="Invitation message" description="Used by “Copy invite”. Placeholders: {event}, {name}, {codename}, {link}, {details} (budget & date)." />
        <TextArea label="Message template" rows={5} value={template} onChange={(e) => setTemplate(e.target.value)} maxLength={2000} />
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={async () => {
              await updateEvent(event.id, { invitationTemplate: template === DEFAULT_INVITATION ? undefined : template });
              toast('Template saved');
            }}
          >
            Save template
          </button>
          <button type="button" className="btn-ghost btn-sm" onClick={() => setTemplate(DEFAULT_INVITATION)}>
            Reset
          </button>
        </div>
      </Card>

      <Callout title="Good to know">
        <ul className="list-disc space-y-1 pl-5">
          <li>Anyone with a link can see that person’s assignment — send each link privately.</li>
          <li>Links can’t be switched off once sent. If you redraw, old links still open and show the old assignment (labelled with their draw version).</li>
          <li>Links contain everything they need; they work on any device, even if you clear this browser.</li>
        </ul>
      </Callout>

      {qr ? <QrModal link={qr.link} name={qr.name} onClose={() => setQr(null)} /> : null}
      <ConfirmDialog
        open={reissue !== null}
        title={`Create a new link for ${reissue ? nameOf(reissue) : ''}?`}
        confirmLabel="Create new link"
        onCancel={() => setReissue(null)}
        onConfirm={async () => {
          const id = reissue!;
          setReissue(null);
          await run(() => issueLinks(event.id, draw.id, [id], 'reissue'), 'New link created');
        }}
      >
        <p>Useful if a link was lost or mangled. The assignment stays the same. The previous link will keep working (it can’t be revoked), and this one will be marked as not yet shared.</p>
      </ConfirmDialog>
    </div>
  );
}
