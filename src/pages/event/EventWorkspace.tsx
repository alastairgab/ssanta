import { useEffect, useMemo, type ReactNode } from 'react';
import { href } from '../../app/router';
import { Icon } from '../../components/ui/icons';
import { EventStatusBadge } from '../../components/dashboard/EventStatusBadge';
import { useDraws, useEvent, useHouseholds, usePeopleMap, useRelationships, useSeriesList } from '../../hooks/useData';
import type { DrawVersion, ExchangeEvent, Household, ID, Participant, ParticipantRelationship } from '../../types/models';
import DetailsStep from './DetailsStep';
import ParticipantsStep from './ParticipantsStep';
import RelationshipsStep from './RelationshipsStep';
import RulesStep from './RulesStep';
import DrawStep from './DrawStep';
import ShareStep from './ShareStep';
import VersionsPage from './VersionsPage';
import WishlistsPage from './WishlistsPage';
import QuestionsPage from './QuestionsPage';
import WithdrawPage from './WithdrawPage';
import SettingsPage from './SettingsPage';
import { participantLabel } from '../../utils/format';

export interface EventCtx {
  event: ExchangeEvent;
  members: Participant[];
  people: Map<ID, Participant>;
  relationships: ParticipantRelationship[];
  households: Household[];
  draws: DrawVersion[];
  activeDraw?: DrawVersion;
  draftDraw?: DrawVersion;
  nameOf: (id: ID) => string;
}

const STEPS = [
  { id: 'details', label: 'Details' },
  { id: 'participants', label: 'Participants' },
  { id: 'relationships', label: 'Relationships' },
  { id: 'rules', label: 'Rules' },
  { id: 'draw', label: 'Draw & confirm' },
  { id: 'share', label: 'Share links' },
];

const EXTRA = [
  { id: 'versions', label: 'Draw versions', icon: Icon.Fingerprint },
  { id: 'wishlists', label: 'Wishlists', icon: Icon.Gift },
  { id: 'questions', label: 'Questions', icon: Icon.Message },
  { id: 'withdraw', label: 'Withdrawals', icon: Icon.Users },
  { id: 'settings', label: 'Settings', icon: Icon.Edit },
];

function defaultStep(ev: ExchangeEvent): string {
  if (ev.participantIds.length < 2) return 'participants';
  switch (ev.status) {
    case 'draft':
    case 'draw-generated':
      return 'draw';
    case 'archived':
      return 'versions';
    default:
      return 'share';
  }
}

function stepDone(stepId: string, ctx: EventCtx): boolean {
  const { event } = ctx;
  switch (stepId) {
    case 'details':
      return Boolean(event.name);
    case 'participants':
      return event.participantIds.length >= 2;
    case 'relationships':
    case 'rules':
      return event.status !== 'draft' || event.participantIds.length >= 2;
    case 'draw':
      return Boolean(event.activeDrawId);
    case 'share':
      return event.status === 'links-ready';
    default:
      return false;
  }
}

export default function EventWorkspace({ eventId, step }: { eventId: string; step?: string }) {
  const event = useEvent(eventId);
  const people = usePeopleMap();
  const relationships = useRelationships();
  const households = useHouseholds();
  const draws = useDraws(eventId);
  const series = useSeriesList();

  const ctx = useMemo<EventCtx | null>(() => {
    if (!event || !relationships || !households || !draws) return null;
    const members = event.participantIds.map((id) => people.get(id)).filter((p): p is Participant => Boolean(p));
    const nameOf = (id: ID) => {
      const p = people.get(id);
      if (p) return participantLabel(p);
      for (const d of draws) {
        const s = d.snapshot.participants.find((x) => x.id === id);
        if (s) return s.displayName;
      }
      return 'Unknown';
    };
    return {
      event,
      members,
      people,
      relationships,
      households,
      draws,
      activeDraw: draws.find((d) => d.id === event.activeDrawId),
      draftDraw: draws.find((d) => d.id === event.draftDrawId && d.status === 'draft'),
      nameOf,
    };
  }, [event, people, relationships, households, draws]);

  useEffect(() => {
    if (event) document.title = `${event.name} · Secret Santa`;
  }, [event]);

  if (event === undefined && draws === undefined) return null;
  if (!event) {
    return (
      <div className="py-16 text-center">
        <h1 className="text-2xl font-semibold">Exchange not found</h1>
        <p className="mt-2 text-pine-700">It may have been deleted, or this link belongs to another browser’s workspace.</p>
        <a className="btn-primary mt-4" href={href('')}>
          Back to dashboard
        </a>
      </div>
    );
  }
  if (!ctx) return null;
  const current = step ?? defaultStep(event);
  const seriesName = series?.find((s) => s.id === event.seriesId)?.name;

  let content: ReactNode;
  switch (current) {
    case 'details':
      content = <DetailsStep ctx={ctx} />;
      break;
    case 'participants':
      content = <ParticipantsStep ctx={ctx} />;
      break;
    case 'relationships':
      content = <RelationshipsStep ctx={ctx} />;
      break;
    case 'rules':
      content = <RulesStep ctx={ctx} />;
      break;
    case 'draw':
      content = <DrawStep ctx={ctx} />;
      break;
    case 'share':
      content = <ShareStep ctx={ctx} />;
      break;
    case 'versions':
      content = <VersionsPage ctx={ctx} />;
      break;
    case 'wishlists':
      content = <WishlistsPage ctx={ctx} />;
      break;
    case 'questions':
      content = <QuestionsPage ctx={ctx} />;
      break;
    case 'withdraw':
      content = <WithdrawPage ctx={ctx} />;
      break;
    case 'settings':
      content = <SettingsPage ctx={ctx} />;
      break;
    default:
      content = <p>Unknown section.</p>;
  }

  const stepIndex = STEPS.findIndex((s) => s.id === current);

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-2 text-sm text-pine-600">
        <a href={href('')} className="hover:underline">
          Dashboard
        </a>{' '}
        /{' '}
        <a href={href(`series/${event.seriesId}`)} className="hover:underline">
          {seriesName ?? 'Series'}
        </a>
      </nav>
      <header className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="min-w-0 break-words text-2xl font-semibold sm:text-3xl">{event.name}</h1>
        <EventStatusBadge status={event.status} />
        {ctx.activeDraw ? (
          <span className="badge bg-white text-pine-800 ring-1 ring-pine-200" title="Current confirmed draw version">
            Draw v{ctx.activeDraw.version}
            {ctx.activeDraw.integrity ? ` · ${ctx.activeDraw.integrity.shortFingerprint}` : ''}
          </span>
        ) : null}
      </header>

      <nav aria-label="Setup steps" className="mb-3 overflow-x-auto">
        <ol className="flex min-w-max gap-1 rounded-2xl bg-white p-1.5 shadow-card ring-1 ring-pine-900/5">
          {STEPS.map((s, i) => {
            const active = s.id === current;
            const done = stepDone(s.id, ctx);
            return (
              <li key={s.id}>
                <a
                  href={href(`events/${event.id}/${s.id}`)}
                  aria-current={active ? 'step' : undefined}
                  className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition ${active ? 'bg-pine-800 text-white' : 'text-pine-800 hover:bg-pine-50'}`}
                >
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                      active ? 'bg-white text-pine-900' : done ? 'bg-pine-600 text-white' : 'bg-pine-100 text-pine-700'
                    }`}
                    aria-hidden
                  >
                    {done && !active ? <Icon.Check className="h-3.5 w-3.5" /> : i + 1}
                  </span>
                  {s.label}
                  {done && !active ? <span className="sr-only"> (done)</span> : null}
                </a>
              </li>
            );
          })}
        </ol>
      </nav>
      <nav aria-label="More for this exchange" className="mb-6 flex flex-wrap gap-1.5">
        {EXTRA.map((x) => (
          <a
            key={x.id}
            href={href(`events/${event.id}/${x.id}`)}
            aria-current={x.id === current ? 'page' : undefined}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition ${
              x.id === current ? 'bg-berry-600 text-white ring-berry-600' : 'bg-white text-pine-800 ring-pine-200 hover:bg-pine-50'
            }`}
          >
            <x.icon className="h-3.5 w-3.5" />
            {x.label}
          </a>
        ))}
      </nav>

      {content}

      {stepIndex >= 0 ? (
        <div className="mt-8 flex justify-between gap-2">
          {stepIndex > 0 ? (
            <a className="btn-secondary" href={href(`events/${event.id}/${STEPS[stepIndex - 1]!.id}`)}>
              ← {STEPS[stepIndex - 1]!.label}
            </a>
          ) : (
            <span />
          )}
          {stepIndex < STEPS.length - 1 ? (
            <a className="btn-pine" href={href(`events/${event.id}/${STEPS[stepIndex + 1]!.id}`)}>
              Next: {STEPS[stepIndex + 1]!.label} →
            </a>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
