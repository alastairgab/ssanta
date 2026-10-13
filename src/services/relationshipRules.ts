import type {
  EventRules,
  ExclusionPolicy,
  Household,
  ID,
  ParticipantRelationship,
  RelationshipType,
} from '../types/models';

export const RELATIONSHIP_TYPE_LABELS: Record<RelationshipType, string> = {
  partner: 'Partner / spouse',
  'parent-child': 'Parent & child',
  sibling: 'Siblings',
  household: 'Same household',
  custom: 'Custom',
};

export const RELATIONSHIP_NOUN: Record<RelationshipType, string> = {
  partner: 'partner',
  'parent-child': 'parent/child',
  sibling: 'sibling',
  household: 'same-household',
  custom: 'custom',
};

export const DEFAULT_RELATIONSHIP_POLICIES: Record<RelationshipType, ExclusionPolicy> = {
  partner: 'mutual',
  'parent-child': 'none',
  sibling: 'none',
  household: 'mutual',
  custom: 'none',
};

export const POLICY_LABELS: Record<ExclusionPolicy, string> = {
  none: 'No exclusion',
  'one-way': 'One-way exclusion',
  mutual: 'Mutual exclusion',
};

export function effectivePolicy(rel: ParticipantRelationship, rules: EventRules): ExclusionPolicy {
  return rules.relationshipOverrides[rel.id] ?? rules.relationshipPolicies[rel.type] ?? 'none';
}

export function isOverridden(rel: ParticipantRelationship, rules: EventRules): boolean {
  return rel.id in rules.relationshipOverrides;
}

/** Directed blocked pairs created by a relationship under its effective policy. */
export function relationshipBlocks(rel: ParticipantRelationship, policy: ExclusionPolicy): [ID, ID][] {
  if (rel.participantA === rel.participantB) return [];
  switch (policy) {
    case 'none':
      return [];
    case 'one-way':
      // participantA may not buy for participantB (for parent-child: parent may not buy for child).
      return [[rel.participantA, rel.participantB]];
    case 'mutual':
      return [
        [rel.participantA, rel.participantB],
        [rel.participantB, rel.participantA],
      ];
  }
}

export function describeRelationship(rel: ParticipantRelationship, nameOf: (id: ID) => string): string {
  const a = nameOf(rel.participantA);
  const b = nameOf(rel.participantB);
  switch (rel.type) {
    case 'partner':
      return `${a} & ${b} are partners`;
    case 'parent-child':
      return `${a} is ${b}'s parent`;
    case 'sibling':
      return `${a} & ${b} are siblings`;
    case 'household':
      return `${a} & ${b} live together`;
    case 'custom':
      return `${a} & ${b}: ${rel.label || 'custom relationship'}`;
  }
}

export function describePolicyEffect(rel: ParticipantRelationship, policy: ExclusionPolicy, nameOf: (id: ID) => string): string {
  const a = nameOf(rel.participantA);
  const b = nameOf(rel.participantB);
  switch (policy) {
    case 'none':
      return 'No restriction';
    case 'one-way':
      return `${a} cannot buy for ${b}`;
    case 'mutual':
      return `${a} and ${b} cannot buy for each other`;
  }
}

export function householdActive(h: Household, rules: EventRules): boolean {
  if (!rules.householdExclusion) return false;
  return rules.householdOverrides[h.id] !== false;
}
