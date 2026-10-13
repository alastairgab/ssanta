import { useMemo, useState } from 'react';
import { href } from '../app/router';
import { Icon } from '../components/ui/icons';
import { Card, EmptyState, PageHeader, Toggle, Callout } from '../components/ui/ui';
import { EventStatusBadge } from '../components/dashboard/EventStatusBadge';
import { useAllDraws, useEvents, useSeriesList } from '../hooks/useData';
import type { DrawVersion, ExchangeEvent } from '../types/models';
import { formatDate, formatMoney, plural } from '../utils/format';
import { sharedCount } from '../services/drawVersions';
import { REVEAL_THEMES } from '../types/models';

function nextAction(ev: ExchangeEvent, draw?: DrawVersion): { label: string; step: string } {
  if (ev.status === 'archived') return { label: 'View', step: 'versions' };
  if (ev.participantIds.length < 2) return { label: 'Add participants', step: 'participants' };
  if (ev.status === 'draft') return { label: 'Generate draw', step: 'draw' };
  if (ev.status === 'draw-generated') return { label: 'Review & confirm', step: 'draw' };
  if (ev.status === 'draw-confirmed') return { label: 'Create links', step: 'share' };
  const total = draw ? Object.keys(draw.distribution).length : 0;
  const shared = sharedCount(draw);
  return { label: shared < total ? `Share links (${shared}/${total})` : 'Manage links', step: 'share' };
}

function EventCard({ ev, draw }: { ev: ExchangeEvent; draw?: DrawVersion }) {
  const action = nextAction(ev, draw);
  const theme = REVEAL_THEMES.find((t) => t.id === ev.theme);
  return (
    <article className="card flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="break-words text-lg font-semibold">
            <a href={href(`events/${ev.id}`)} className="hover:underline">
              {ev.name}
            </a>
          </h3>
          <p className="text-sm text-pine-700">
            {ev.year}
            {ev.exchangeDate ? ` · ${formatDate(ev.exchangeDate)}` : ''}
          </p>
        </div>
        <EventStatusBadge status={ev.status} />
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-lg bg-pine-50 p-2">
          <dt className="text-pine-600">People</dt>
          <dd className="text-base font-semibold">{ev.participantIds.length}</dd>
        </div>
        <div className="rounded-lg bg-pine-50 p-2">
          <dt className="text-pine-600">Budget</dt>
          <dd className="text-base font-semibold">{ev.budget !== undefined ? formatMoney(ev.budget, ev.currency) : '—'}</dd>
        </div>
        <div className="rounded-lg bg-pine-50 p-2">
          <dt className="text-pine-600">Draw</dt>
          <dd className="text-base font-semibold">{draw ? `v${draw.version}` : '—'}</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-pine-600">Theme: {theme?.name}</p>
      <div className="mt-4 flex gap-2">
        <a className="btn-primary btn-sm flex-1" href={href(`events/${ev.id}/${action.step}`)}>
          {action.label}
          <Icon.Chevron className="h-4 w-4" />
        </a>
        <a className="btn-secondary btn-sm" href={href(`events/${ev.id}`)}>
          Open
        </a>
      </div>
    </article>
  );
}

export default function DashboardPage() {
  const events = useEvents();
  const series = useSeriesList();
  const draws = useAllDraws();
  const [showArchived, setShowArchived] = useState(false);
  const drawById = useMemo(() => new Map((draws ?? []).map((d) => [d.id, d])), [draws]);

  if (!events || !series) return null;

  const grouped = series
    .map((s) => ({
      series: s,
      events: events.filter((e) => e.seriesId === s.id && (showArchived || e.status !== 'archived')).sort((a, b) => b.year - a.year),
      all: events.filter((e) => e.seriesId === s.id),
    }))
    .filter((g) => g.events.length > 0 || (showArchived && g.all.length === 0))
    .sort((a, b) => (b.events[0]?.year ?? 0) - (a.events[0]?.year ?? 0));

  if (events.length === 0) {
    return (
      <>
        <section className="relative overflow-hidden rounded-3xl bg-pine-900 px-6 py-10 text-white sm:px-10 sm:py-14">
          <div className="absolute -right-10 -top-10 h-56 w-56 rounded-full bg-berry-600/30 blur-2xl" aria-hidden />
          <div className="absolute -bottom-16 left-1/3 h-48 w-48 rounded-full bg-gold-400/20 blur-2xl" aria-hidden />
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-gold-300">Welcome</p>
          <h1 className="mt-2 max-w-2xl text-3xl font-semibold sm:text-4xl">Run a fair, private Secret Santa — no accounts, no servers.</h1>
          <p className="mt-3 max-w-xl text-pine-100">
            Set up your group, add a few house rules, and the app draws names for you. Everyone gets their own encrypted link to discover who they’re buying for.
          </p>
          <a href={href('events/new')} className="btn-primary mt-6">
            <Icon.Plus className="h-5 w-5" /> Create your first exchange
          </a>
        </section>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            ['1. Add your people', 'Add names, partners and households once — they’re remembered for next year.', Icon.Users],
            ['2. Draw fairly', 'Rules like “partners don’t draw each other” and “no repeats from last year” are handled for you.', Icon.Sparkle],
            ['3. Send the links', 'Copy each personal link into WhatsApp, Discord, email or a text. Each one opens a festive reveal.', Icon.Link],
          ].map(([title, body, I]) => {
            const IconC = I as typeof Icon.Users;
            return (
              <Card key={title as string}>
                <IconC className="h-7 w-7 text-berry-600" />
                <h2 className="mt-3 text-lg font-semibold">{title as string}</h2>
                <p className="mt-1 text-sm text-pine-700">{body as string}</p>
              </Card>
            );
          })}
        </div>
        <Callout className="mt-6" title="Your data stays on this device">
          Everything you enter is stored in this browser only. Nothing is uploaded. Use <a className="font-semibold underline" href={href('backup')}>Backups</a> to save a copy or move to another device.
        </Callout>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Your exchanges"
        subtitle={`${plural(events.filter((e) => e.status !== 'archived').length, 'active exchange')} across ${plural(series.length, 'series', 'series')}`}
        action={
          <a href={href('events/new')} className="btn-primary">
            <Icon.Plus className="h-5 w-5" /> New exchange
          </a>
        }
      />
      <div className="mb-6">
        <Toggle checked={showArchived} onChange={setShowArchived} label="Show archived exchanges" />
      </div>
      {grouped.length === 0 ? (
        <EmptyState title="No active exchanges" icon={<Icon.Gift />}>
          Turn on “Show archived” to see past exchanges, or create a new one.
        </EmptyState>
      ) : (
        <div className="space-y-10">
          {grouped.map(({ series: s, events: evs }) => (
            <section key={s.id} aria-labelledby={`series-${s.id}`}>
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2 id={`series-${s.id}`} className="text-xl font-semibold">
                  <a className="hover:underline" href={href(`series/${s.id}`)}>
                    {s.name}
                  </a>
                </h2>
                <a className="text-sm font-semibold text-berry-700 hover:underline" href={href(`events/new?series=${s.id}`)}>
                  + Add a year
                </a>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {evs.map((ev) => (
                  <EventCard key={ev.id} ev={ev} draw={ev.activeDrawId ? drawById.get(ev.activeDrawId) : undefined} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
