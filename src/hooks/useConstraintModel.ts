import { useMemo } from 'react';
import { buildConstraintModel, type ConstraintInput, type ConstraintModel } from '../services/constraintModel';
import { useHistoryEntries } from './useData';
import type { EventCtx } from '../pages/event/EventWorkspace';

/** Live constraint model for the event's current rules (cheap to build, used by the matrix & review). */
export function useConstraintModel(ctx: EventCtx): { model?: ConstraintModel; input?: ConstraintInput } {
  const history = useHistoryEntries(ctx.event.id);
  return useMemo(() => {
    if (!history) return {};
    const input: ConstraintInput = {
      participants: ctx.members.map((m) => ({ id: m.id, label: ctx.nameOf(m.id) })),
      rules: ctx.event.rules,
      relationships: ctx.relationships,
      households: ctx.households,
      history,
      eventYear: ctx.event.year,
    };
    return { model: buildConstraintModel(input), input };
  }, [ctx, history]);
}
