import { z } from 'zod';

/**
 * Validation schemas for untrusted imported data (backups). Every string has a length cap,
 * every collection a size cap, and unknown fields are stripped. Validated data is still only
 * ever rendered as text by React (never as HTML).
 */

const id = z.string().min(1).max(100);
const ts = z.string().max(40);
const text = (max = 2000) => z.string().max(max);
const sv = z.number().int().min(1).max(1000);

export const participantSchema = z.object({
  schemaVersion: sv,
  id,
  displayName: text(200).min(1),
  nickname: text(200).optional(),
  notes: text(4000).optional(),
  disambiguator: text(200).optional(),
  active: z.boolean(),
  createdAt: ts,
  updatedAt: ts,
});

export const relationshipSchema = z.object({
  schemaVersion: sv,
  id,
  type: z.enum(['partner', 'parent-child', 'sibling', 'household', 'custom']),
  participantA: id,
  participantB: id,
  label: text(200).optional(),
  createdAt: ts,
});

export const householdSchema = z.object({
  schemaVersion: sv,
  id,
  name: text(200),
  kind: z.enum(['household', 'group']),
  memberIds: z.array(id).max(1000),
  createdAt: ts,
});

export const seriesSchema = z.object({
  schemaVersion: sv,
  id,
  name: text(200),
  description: text(2000).optional(),
  createdAt: ts,
  archived: z.boolean().optional(),
});

const policy = z.enum(['none', 'one-way', 'mutual']);

export const rulesSchema = z.object({
  forced: z.array(z.object({ id, giverId: id, recipientId: id, enabled: z.boolean(), note: text(500).optional() })).max(2000),
  forbidden: z.array(z.object({ id, giverId: id, recipientId: id, mutual: z.boolean(), enabled: z.boolean(), note: text(500).optional() })).max(5000),
  preventReciprocal: z.boolean(),
  relationshipPolicies: z.object({ partner: policy, 'parent-child': policy, sibling: policy, household: policy, custom: policy }),
  relationshipOverrides: z.record(id, policy),
  householdExclusion: z.boolean(),
  householdOverrides: z.record(id, z.boolean()),
  history: z.object({
    mode: z.enum(['none', 'last-1', 'last-2', 'last-3', 'all', 'custom']),
    customYears: z.number().int().min(0).max(100).optional(),
    strength: z.enum(['hard', 'soft']),
    sourceSeriesIds: z.array(id).max(100),
    recencyDecay: z.number().min(0).max(1),
    frequencyWeight: z.number().min(0).max(10),
    discourageReverse: z.boolean(),
  }),
});

const jwk = z.record(z.string().max(20), z.union([z.string().max(1000), z.array(z.string().max(50)).max(20), z.boolean()]));

export const eventSchema = z.object({
  schemaVersion: sv,
  id,
  seriesId: id,
  name: text(200),
  year: z.number().int().min(1900).max(3000),
  exchangeDate: text(40).optional(),
  budget: z.number().min(0).max(1e9).optional(),
  currency: text(10),
  description: text(2000).optional(),
  organiserNotes: text(4000).optional(),
  theme: z.enum(['classic', 'present', 'advent', 'elegant']),
  greeting: text(1000).optional(),
  location: text(500).optional(),
  instructions: text(2000).optional(),
  participantIds: z.array(id).max(1000),
  status: z.enum(['draft', 'draw-generated', 'draw-confirmed', 'links-ready', 'archived']),
  rules: rulesSchema,
  codenamesEnabled: z.boolean(),
  codenames: z.record(id, text(200)),
  concealAssignments: z.boolean(),
  draftDrawId: id.optional(),
  activeDrawId: id.optional(),
  relayKeys: z.object({ publicKeyJwk: jwk, privateKeyJwk: jwk, createdAt: ts }).optional(),
  includeWishlists: z.boolean(),
  invitationTemplate: text(2000).optional(),
  createdAt: ts,
  updatedAt: ts,
});

export const historySchema = z.object({
  schemaVersion: sv,
  id,
  seriesId: id,
  year: z.number().int().min(1900).max(3000),
  giverId: id,
  recipientId: id,
  source: z.enum(['manual', 'import']),
  note: text(500).optional(),
  createdAt: ts,
});

const assignment = z.object({ giverId: id, recipientId: id });

const solverSchema = z.object({
  method: z.enum(['matching', 'branch-and-bound', 'repair']),
  provenOptimal: z.boolean(),
  softScore: z.number(),
  repeatCount: z.number(),
  nodesExplored: z.number(),
  elapsedMs: z.number(),
  changedCount: z.number().optional(),
});

const distributionSchema = z.object({
  giverId: id,
  link: text(20000).optional(),
  issueNumber: z.number().int().min(0),
  issuedAt: ts.optional(),
  issues: z.array(z.object({ issuedAt: ts, issueNumber: z.number().int(), reason: z.enum(['initial', 'wishlist-update', 'replacement', 'reissue']) })).max(1000),
  shared: z.boolean(),
  sharedAt: ts.optional(),
  carriedFromDrawId: id.optional(),
  carriedFromVersion: z.number().int().optional(),
});

export const drawSchema = z.object({
  schemaVersion: sv,
  id,
  eventId: id,
  version: z.number().int().min(0),
  status: z.enum(['draft', 'confirmed', 'active', 'superseded', 'archived']),
  reason: z.enum(['initial', 'redraw', 'withdrawal-repair']),
  parentDrawId: id.optional(),
  createdAt: ts,
  confirmedAt: ts.optional(),
  supersededAt: ts.optional(),
  snapshot: z.object({
    schemaVersion: sv,
    eventId: id,
    seriesId: id,
    eventName: text(200),
    year: z.number().int(),
    version: z.number().int(),
    participants: z.array(z.object({ id, displayName: text(200), codename: text(200).optional() })).max(1000),
    assignments: z.array(assignment).max(1000),
    rules: rulesSchema,
    generatedAt: ts,
    solver: solverSchema,
  }),
  integrity: z
    .object({
      algorithm: z.literal('SHA-256'),
      canonicalisation: z.literal('ss-canonical-json-v1'),
      digestHex: z.string().regex(/^[0-9a-f]{64}$/),
      shortFingerprint: text(20),
      computedAt: ts,
    })
    .optional(),
  distribution: z.record(id, distributionSchema),
  note: text(2000).optional(),
  removedParticipantIds: z.array(id).max(1000).optional(),
});

export const wishlistSchema = z.object({
  schemaVersion: sv,
  id: text(250),
  eventId: id,
  participantId: id,
  interests: text().optional(),
  hobbies: text().optional(),
  retailers: text().optional(),
  suggestions: text(4000).optional(),
  avoid: text().optional(),
  sizes: text(1000).optional(),
  notes: text(4000).optional(),
  links: z.array(text(2000)).max(20),
  organiserNotes: text(4000).optional(),
  source: z.enum(['organiser', 'submission']),
  updatedAt: ts,
});

export const questionSchema = z.object({
  schemaVersion: sv,
  id,
  eventId: id,
  drawId: id,
  giverId: id,
  recipientId: id,
  text: text(2000),
  askedAt: ts,
  importedAt: ts,
  recipientLink: text(20000).optional(),
  forwardedToRecipient: z.boolean(),
  status: z.enum(['received', 'forwarded', 'answered', 'returned']),
});

export const replySchema = z.object({
  schemaVersion: sv,
  id,
  questionId: id,
  text: text(4000),
  repliedAt: ts,
  importedAt: ts,
  giverLink: text(20000).optional(),
  returnedToGiver: z.boolean(),
});

export const settingSchema = z.object({ key: text(100), value: z.unknown() });

const list = <T extends z.ZodTypeAny>(s: T, max = 10000) => z.array(s).max(max).default([]);

export const workspaceDataSchema = z.object({
  series: list(seriesSchema),
  events: list(eventSchema),
  participants: list(participantSchema),
  relationships: list(relationshipSchema),
  households: list(householdSchema),
  history: list(historySchema, 100000),
  draws: list(drawSchema),
  wishlists: list(wishlistSchema),
  questions: list(questionSchema),
  replies: list(replySchema),
  settings: list(settingSchema, 1000),
});

export const manifestSchema = z.object({
  format: z.literal('secret-santa-backup'),
  schemaVersion: z.number().int().min(1),
  appVersion: text(40),
  exportedAt: ts,
  containsAssignments: z.boolean(),
  encrypted: z.boolean(),
  counts: z.record(z.string().max(40), z.number()),
});
