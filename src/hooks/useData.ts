import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import type { ID, Participant } from '../types/models';
import { db, deriveHistory } from '../services/storage';

/** Live IndexedDB queries — components re-render automatically when data changes. */

export const useEvents = () => useLiveQuery(() => db.events.toArray(), []);
export const useEvent = (id: ID | undefined) => useLiveQuery(() => (id ? db.events.get(id) : undefined), [id]);
export const useSeriesList = () => useLiveQuery(() => db.series.toArray(), []);
export const useParticipants = () => useLiveQuery(() => db.participants.toArray(), []);
export const useRelationships = () => useLiveQuery(() => db.relationships.toArray(), []);
export const useHouseholds = () => useLiveQuery(() => db.households.toArray(), []);
export const useManualHistory = () => useLiveQuery(() => db.history.toArray(), []);
export const useAllDraws = () => useLiveQuery(() => db.draws.toArray(), []);
export const useDraws = (eventId: ID | undefined) =>
  useLiveQuery(async () => (eventId ? (await db.draws.where('eventId').equals(eventId).toArray()).sort((a, b) => a.version - b.version) : []), [eventId]);
export const useDraw = (id: ID | undefined) => useLiveQuery(() => (id ? db.draws.get(id) : undefined), [id]);
export const useWishlists = (eventId: ID | undefined) => useLiveQuery(() => (eventId ? db.wishlists.where('eventId').equals(eventId).toArray() : []), [eventId]);
export const useQuestions = (eventId: ID | undefined) => useLiveQuery(() => (eventId ? db.questions.where('eventId').equals(eventId).toArray() : []), [eventId]);
export const useReplies = () => useLiveQuery(() => db.replies.toArray(), []);

export function usePeopleMap(): Map<ID, Participant> {
  const people = useParticipants();
  return useMemo(() => new Map((people ?? []).map((p) => [p.id, p])), [people]);
}

/** Every historical pairing (manual + confirmed draws), optionally excluding one event. */
export function useHistoryEntries(excludeEventId?: ID) {
  const events = useEvents();
  const draws = useAllDraws();
  const manual = useManualHistory();
  return useMemo(() => {
    if (!events || !draws || !manual) return undefined;
    return deriveHistory(
      events.filter((e) => e.id !== excludeEventId),
      draws,
      manual,
    );
  }, [events, draws, manual, excludeEventId]);
}
