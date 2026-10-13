import type {
  EventRules,
  ForbiddenAssignment,
  ForcedAssignment,
  Household,
  HistoryEntry,
  ParticipantRelationship,
  RelationshipType,
} from '../types/models';
import type { ConstraintInput } from '../services/constraintModel';
import { DEFAULT_RELATIONSHIP_POLICIES } from '../services/relationshipRules';

export function baseRules(overrides: Partial<EventRules> = {}): EventRules {
  return {
    forced: [],
    forbidden: [],
    preventReciprocal: false,
    relationshipPolicies: { ...DEFAULT_RELATIONSHIP_POLICIES },
    relationshipOverrides: {},
    householdExclusion: true,
    householdOverrides: {},
    history: {
      mode: 'none',
      strength: 'hard',
      sourceSeriesIds: ['s1'],
      recencyDecay: 0.6,
      frequencyWeight: 0.5,
      discourageReverse: false,
    },
    ...overrides,
  };
}

/** Participants are identified by their (unique in tests) names for readability. */
export function makeInput(
  names: string[],
  opts: {
    rules?: Partial<EventRules>;
    relationships?: { a: string; b: string; type: RelationshipType; id?: string; label?: string }[];
    households?: { name: string; members: string[]; id?: string }[];
    history?: { year: number; giver: string; recipient: string; series?: string }[];
    year?: number;
  } = {},
): ConstraintInput {
  const relationships: ParticipantRelationship[] = (opts.relationships ?? []).map((r, i) => ({
    schemaVersion: 1,
    id: r.id ?? `rel${i}`,
    type: r.type,
    participantA: r.a,
    participantB: r.b,
    label: r.label,
    createdAt: '',
  }));
  const households: Household[] = (opts.households ?? []).map((h, i) => ({
    schemaVersion: 1,
    id: h.id ?? `h${i}`,
    name: h.name,
    kind: 'household',
    memberIds: h.members,
    createdAt: '',
  }));
  const history: HistoryEntry[] = (opts.history ?? []).map((h) => ({
    seriesId: h.series ?? 's1',
    year: h.year,
    giverId: h.giver,
    recipientId: h.recipient,
    source: 'manual',
  }));
  return {
    participants: names.map((n) => ({ id: n, label: n })),
    rules: baseRules(opts.rules),
    relationships,
    households,
    history,
    eventYear: opts.year ?? 2026,
  };
}

export const forced = (giver: string, recipient: string, id = `f_${giver}_${recipient}`): ForcedAssignment => ({
  id,
  giverId: giver,
  recipientId: recipient,
  enabled: true,
});

export const forbidden = (giver: string, recipient: string, mutual = false, id = `x_${giver}_${recipient}`): ForbiddenAssignment => ({
  id,
  giverId: giver,
  recipientId: recipient,
  mutual,
  enabled: true,
});

export const names = (n: number) => Array.from({ length: n }, (_, i) => `P${i + 1}`);
