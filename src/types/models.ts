/**
 * Core data models for the Secret Santa organiser workspace.
 *
 * Design rules:
 *  - Every record is keyed by a random, non-predictable ID (never a display name).
 *  - Participant identity (Participant) is separate from yearly membership (ExchangeEvent.participantIds).
 *  - Relationship definitions (ParticipantRelationship) are separate from exclusion policies (EventRules).
 *  - Historical records are separate from the current draw.
 *  - Confirmed draw snapshots are immutable; only metadata (status, distribution) may change.
 *  - Every persisted record carries a schemaVersion so future releases can migrate safely.
 */

export type ID = string;
/** ISO-8601 timestamp string. */
export type Timestamp = string;

export const CURRENT_SCHEMA_VERSION = 1 as const;

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

export interface Participant {
  schemaVersion: number;
  id: ID;
  displayName: string;
  nickname?: string;
  /** Organiser-only notes. Never included in reveal links. */
  notes?: string;
  /** Short label used to tell apart people with the same name, e.g. "Mum's side". */
  disambiguator?: string;
  /** Inactive participants are hidden from pickers but keep their history. */
  active: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type RelationshipType = 'partner' | 'parent-child' | 'sibling' | 'household' | 'custom';

export interface ParticipantRelationship {
  schemaVersion: number;
  id: ID;
  type: RelationshipType;
  /** For parent-child: participantA is the parent and participantB the child. */
  participantA: ID;
  participantB: ID;
  /** Free-text label, required for custom relationships ("Best friends", "Manager / report"). */
  label?: string;
  createdAt: Timestamp;
}

export interface Household {
  schemaVersion: number;
  id: ID;
  name: string;
  kind: 'household' | 'group';
  memberIds: ID[];
  createdAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Series & events
// ---------------------------------------------------------------------------

export interface ExchangeSeries {
  schemaVersion: number;
  id: ID;
  name: string;
  description?: string;
  createdAt: Timestamp;
  archived?: boolean;
}

export type EventStatus = 'draft' | 'draw-generated' | 'draw-confirmed' | 'links-ready' | 'archived';

export type ThemeId = 'classic' | 'present' | 'advent' | 'elegant';

export type ExclusionPolicy = 'none' | 'one-way' | 'mutual';

export interface ForcedAssignment {
  id: ID;
  giverId: ID;
  recipientId: ID;
  enabled: boolean;
  note?: string;
}

export interface ForbiddenAssignment {
  id: ID;
  giverId: ID;
  recipientId: ID;
  /** When true neither person may buy for the other. */
  mutual: boolean;
  enabled: boolean;
  note?: string;
}

export type HistoryMode = 'none' | 'last-1' | 'last-2' | 'last-3' | 'all' | 'custom';

export interface HistoricalPreferencePolicy {
  mode: HistoryMode;
  /** Number of previous event years when mode === 'custom'. */
  customYears?: number;
  /** hard = repeats forbidden; soft = repeats discouraged but allowed. */
  strength: 'hard' | 'soft';
  /** Series whose history counts. Defaults to the event's own series. */
  sourceSeriesIds: ID[];
  /** Soft scoring weights (see historicalFairness.ts for the documented model). */
  recencyDecay: number;
  frequencyWeight: number;
  /** Also discourage drawing the person who drew you last time (soft only). */
  discourageReverse: boolean;
}

/** All configurable assignment rules for one event. */
export interface EventRules {
  forced: ForcedAssignment[];
  forbidden: ForbiddenAssignment[];
  preventReciprocal: boolean;
  /** Default exclusion per relationship type. */
  relationshipPolicies: Record<RelationshipType, ExclusionPolicy>;
  /** Per-relationship exceptions; absent = use the type default. */
  relationshipOverrides: Record<ID, ExclusionPolicy>;
  /** Whether members of the same household/group may not buy for each other. */
  householdExclusion: boolean;
  /** Per-household exceptions: false = this household is exempt. */
  householdOverrides: Record<ID, boolean>;
  history: HistoricalPreferencePolicy;
}

export interface ExchangeEvent {
  schemaVersion: number;
  id: ID;
  seriesId: ID;
  name: string;
  year: number;
  exchangeDate?: string;
  budget?: number;
  currency: string;
  description?: string;
  organiserNotes?: string;
  theme: ThemeId;
  greeting?: string;
  location?: string;
  instructions?: string;
  participantIds: ID[];
  status: EventStatus;
  rules: EventRules;
  codenamesEnabled: boolean;
  codenames: Record<ID, string>;
  /** Visual-only privacy: hide recipient names in the organiser dashboard. */
  concealAssignments: boolean;
  /** ID of the draft (unconfirmed) draw, if any. */
  draftDrawId?: ID;
  /** ID of the current confirmed draw version. */
  activeDrawId?: ID;
  /** Organiser relay key pair used for V2 wishlist submissions and anonymous questions. */
  relayKeys?: RelayKeyPair;
  /** Include recipients' wishlists in reveal links (V2). */
  includeWishlists: boolean;
  /** Optional custom invitation message template. {event} {name} {link} placeholders. */
  invitationTemplate?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface RelayKeyPair {
  publicKeyJwk: JsonWebKey;
  privateKeyJwk: JsonWebKey;
  createdAt: Timestamp;
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

export interface HistoricalAssignment {
  schemaVersion: number;
  id: ID;
  seriesId: ID;
  year: number;
  giverId: ID;
  recipientId: ID;
  /** 'manual' and 'import' records are entered by the organiser; draw-derived history is computed live. */
  source: 'manual' | 'import';
  note?: string;
  createdAt: Timestamp;
}

/** A historical pairing as used by the rules engine (manual records + confirmed draws of other events). */
export interface HistoryEntry {
  seriesId: ID;
  year: number;
  giverId: ID;
  recipientId: ID;
  source: 'manual' | 'import' | 'draw';
  eventId?: ID;
}

// ---------------------------------------------------------------------------
// Draws
// ---------------------------------------------------------------------------

export interface Assignment {
  giverId: ID;
  recipientId: ID;
}

export interface SolverInfo {
  method: 'matching' | 'branch-and-bound' | 'repair';
  /** True only when the solver proved no lower-cost valid draw exists. */
  provenOptimal: boolean;
  /** Total soft-penalty score (0 = no discouraged pairings used). */
  softScore: number;
  repeatCount: number;
  nodesExplored: number;
  elapsedMs: number;
  /** For repairs: number of givers whose recipient changed. */
  changedCount?: number;
}

/** Frozen copy of everything that defined a draw. Hashed for the integrity fingerprint. */
export interface DrawSnapshot {
  schemaVersion: number;
  eventId: ID;
  seriesId: ID;
  eventName: string;
  year: number;
  version: number;
  participants: { id: ID; displayName: string; codename?: string }[];
  assignments: Assignment[];
  rules: EventRules;
  generatedAt: Timestamp;
  solver: SolverInfo;
}

export type DrawStatus = 'draft' | 'confirmed' | 'active' | 'superseded' | 'archived';

export interface DrawIntegrityRecord {
  algorithm: 'SHA-256';
  canonicalisation: 'ss-canonical-json-v1';
  digestHex: string;
  shortFingerprint: string;
  computedAt: Timestamp;
}

export interface LinkIssue {
  issuedAt: Timestamp;
  issueNumber: number;
  reason: 'initial' | 'wishlist-update' | 'replacement' | 'reissue';
}

export interface DistributionRecord {
  giverId: ID;
  /** The current reveal link (stored locally so the organiser can copy it again). */
  link?: string;
  issueNumber: number;
  issuedAt?: Timestamp;
  issues: LinkIssue[];
  shared: boolean;
  sharedAt?: Timestamp;
  /** Set when an older draw version's link remains correct for this giver after a repair. */
  carriedFromDrawId?: ID;
  carriedFromVersion?: number;
}

export interface DrawVersion {
  schemaVersion: number;
  id: ID;
  eventId: ID;
  version: number;
  status: DrawStatus;
  reason: 'initial' | 'redraw' | 'withdrawal-repair';
  parentDrawId?: ID;
  createdAt: Timestamp;
  confirmedAt?: Timestamp;
  supersededAt?: Timestamp;
  snapshot: DrawSnapshot;
  integrity?: DrawIntegrityRecord;
  distribution: Record<ID, DistributionRecord>;
  /** Free-text organiser note, e.g. withdrawal reason. */
  note?: string;
  /** For repairs: participants removed relative to the parent draw. */
  removedParticipantIds?: ID[];
}

// ---------------------------------------------------------------------------
// Version 2 — wishlists, questions, repairs
// ---------------------------------------------------------------------------

export interface ParticipantWishlist {
  schemaVersion: number;
  /** `${eventId}:${participantId}` */
  id: string;
  eventId: ID;
  participantId: ID;
  interests?: string;
  hobbies?: string;
  retailers?: string;
  suggestions?: string;
  avoid?: string;
  sizes?: string;
  notes?: string;
  links: string[];
  /** Organiser-only; never included in links. */
  organiserNotes?: string;
  source: 'organiser' | 'submission';
  updatedAt: Timestamp;
}

/** The subset of a wishlist that may be shared with the recipient's giver. */
export type PublicWishlist = Pick<
  ParticipantWishlist,
  'interests' | 'hobbies' | 'retailers' | 'suggestions' | 'avoid' | 'sizes' | 'notes' | 'links'
>;

export interface AnonymousQuestion {
  schemaVersion: number;
  id: ID;
  eventId: ID;
  drawId: ID;
  giverId: ID;
  recipientId: ID;
  text: string;
  askedAt: Timestamp;
  importedAt: Timestamp;
  /** Link the organiser forwards to the recipient. */
  recipientLink?: string;
  forwardedToRecipient: boolean;
  status: 'received' | 'forwarded' | 'answered' | 'returned';
}

export interface AnonymousReply {
  schemaVersion: number;
  id: ID;
  questionId: ID;
  text: string;
  repliedAt: Timestamp;
  importedAt: Timestamp;
  /** Link the organiser forwards back to the giver. */
  giverLink?: string;
  returnedToGiver: boolean;
}

export interface WithdrawalRepair {
  withdrawnIds: ID[];
  previous: Assignment[];
  proposed: Assignment[];
  unchanged: Assignment[];
  changed: { giverId: ID; from: ID | null; to: ID }[];
  solver: SolverInfo;
}

// ---------------------------------------------------------------------------
// Settings & backups
// ---------------------------------------------------------------------------

export interface AppSetting {
  key: string;
  value: unknown;
}

export interface BackupManifest {
  format: 'secret-santa-backup';
  schemaVersion: number;
  appVersion: string;
  exportedAt: Timestamp;
  containsAssignments: boolean;
  encrypted: boolean;
  counts: Record<string, number>;
}

export interface WorkspaceData {
  series: ExchangeSeries[];
  events: ExchangeEvent[];
  participants: Participant[];
  relationships: ParticipantRelationship[];
  households: Household[];
  history: HistoricalAssignment[];
  draws: DrawVersion[];
  wishlists: ParticipantWishlist[];
  questions: AnonymousQuestion[];
  replies: AnonymousReply[];
  settings: AppSetting[];
}

export interface PlainBackup {
  manifest: BackupManifest;
  data: WorkspaceData;
}

export interface EncryptedBackup {
  manifest: BackupManifest;
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; saltB64: string };
  cipher: { name: 'AES-GCM'; ivB64: string };
  ciphertextB64: string;
}

export type RevealTheme = {
  id: ThemeId;
  name: string;
  description: string;
};

export const REVEAL_THEMES: RevealTheme[] = [
  { id: 'classic', name: 'Classic Christmas Letter', description: 'A sealed envelope opens to reveal a candy-cane bordered letter.' },
  { id: 'present', name: 'Mystery Present', description: 'Untie the ribbon on a wrapped gift to reveal the name inside.' },
  { id: 'advent', name: 'Advent Calendar', description: 'Open the glowing door in a snowy village advent calendar.' },
  { id: 'elegant', name: 'Elegant Christmas', description: 'Evergreen and champagne gold — a luxury card unfolds.' },
];
