import { pickRandom, secureRandomInt } from '../utils/random';

/**
 * Festive codename generator. Codenames are decorative only — they are NOT an anonymity
 * mechanism: the organiser knows who holds each codename.
 *
 * Combinations: 10 patterns over 40 titles × 48 adjectives × 56 nouns ≈ 100 000+ distinct names.
 */

const TITLES = [
  'Agent', 'Captain', 'Commander', 'Major', 'Professor', 'Doctor', 'Sergeant', 'Admiral', 'Detective', 'Lord',
  'Lady', 'Sir', 'Dame', 'General', 'Inspector', 'Chief', 'Baron', 'Duchess', 'Count', 'Ranger',
  'Pilot', 'Navigator', 'Marshal', 'Scout', 'Keeper', 'Warden', 'Ambassador', 'Envoy', 'Courier', 'Secret Elf',
  'Elf', 'Special Agent', 'Field Agent', 'Lieutenant', 'Colonel', 'Officer', 'Guardian', 'Master', 'Maestro', 'Sentinel',
];

const ADJECTIVES = [
  'Frosty', 'Jolly', 'Twinkling', 'Midnight', 'Snowy', 'Sparkling', 'Velvet', 'Golden', 'Silver', 'Merry',
  'Glittering', 'Crimson', 'Evergreen', 'Starlit', 'Cosy', 'Whispering', 'Moonlit', 'Polar', 'Frozen', 'Festive',
  'Shimmering', 'Peppermint', 'Cinnamon', 'Gingerbread', 'Sugarplum', 'Hollyberry', 'Northern', 'Silent', 'Mysterious', 'Secret',
  'Dashing', 'Prancing', 'Glowing', 'Icy', 'Wintry', 'Candlelit', 'Tinselled', 'Snowbound', 'Spiced', 'Ribboned',
  'Feathered', 'Woolly', 'Bright', 'Hidden', 'Sneaky', 'Quiet', 'Nimble', 'Radiant',
];

const NOUNS = [
  'Snowflake', 'Tinsel', 'Reindeer', 'Fox', 'Mistletoe', 'Candy Cane', 'Nutcracker', 'Snowman', 'Penguin', 'Owl',
  'Robin', 'Holly', 'Pine Cone', 'Bauble', 'Sleigh', 'Star', 'Lantern', 'Gingerbread', 'Icicle', 'Snowdrop',
  'Polar Bear', 'Elf', 'Chimney', 'Stocking', 'Bell', 'Wreath', 'Candle', 'Comet', 'Aurora', 'Snow Globe',
  'Sugarplum', 'Marshmallow', 'Cocoa', 'Pudding', 'Cracker', 'Ribbon', 'Mitten', 'Scarf', 'Toboggan', 'Snowball',
  'Hare', 'Badger', 'Wren', 'Squirrel', 'Moose', 'Husky', 'Narwhal', 'Puffin', 'Lynx', 'Stag',
  'Fir', 'Ivy', 'Frost', 'Blizzard', 'Yule Log', 'Carol',
];

const OPERATIONS = ['Operation', 'Project', 'Mission'];

const PATTERNS: (() => string)[] = [
  () => `${pickRandom(TITLES)} ${pickRandom(NOUNS)}`,
  () => `${pickRandom(TITLES)} ${pickRandom(ADJECTIVES)}`,
  () => `${pickRandom(ADJECTIVES)} ${pickRandom(NOUNS)}`,
  () => `The ${pickRandom(ADJECTIVES)} ${pickRandom(NOUNS)}`,
  () => `${pickRandom(TITLES)} ${pickRandom(ADJECTIVES)} ${pickRandom(NOUNS)}`,
  () => `The ${pickRandom(NOUNS)} Phantom`,
  () => `${pickRandom(OPERATIONS)} ${pickRandom(NOUNS)}`,
  () => `${pickRandom(ADJECTIVES)} ${pickRandom(NOUNS)} ${['One', 'Two', 'Three', 'Seven', 'Nine', 'Twelve'][secureRandomInt(6)]}`,
  () => `The ${pickRandom(ADJECTIVES)} ${pickRandom(['Phantom', 'Courier', 'Shadow', 'Whisper', 'Visitor', 'Wanderer'])}`,
  () => `${pickRandom(TITLES)} ${pickRandom(NOUNS)} ${['Seven', 'Nine', 'Twelve', 'Twenty-Four', 'Zero'][secureRandomInt(5)]}`,
];

export function generateCodename(): string {
  return PATTERNS[secureRandomInt(PATTERNS.length)]!();
}

export const normaliseCodename = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** Generate a codename that isn't already used (case-insensitive) within the event. */
export function generateUniqueCodename(existing: Iterable<string>): string {
  const taken = new Set(Array.from(existing, normaliseCodename));
  for (let attempt = 0; attempt < 500; attempt++) {
    const name = generateCodename();
    if (!taken.has(normaliseCodename(name))) return name;
  }
  // Extremely unlikely fallback: append a number
  let i = 2;
  const base = generateCodename();
  while (taken.has(normaliseCodename(`${base} ${i}`))) i++;
  return `${base} ${i}`;
}

/** Assign unique codenames to participants who don't have one (keeps existing ones). */
export function fillCodenames(participantIds: string[], current: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  const used: string[] = [];
  for (const id of participantIds) {
    const existing = current[id]?.trim();
    if (existing && !used.map(normaliseCodename).includes(normaliseCodename(existing))) {
      out[id] = existing;
      used.push(existing);
    }
  }
  for (const id of participantIds) {
    if (out[id]) continue;
    const name = generateUniqueCodename(used);
    out[id] = name;
    used.push(name);
  }
  return out;
}

export function findDuplicateCodenames(codenames: Record<string, string>): string[] {
  const seen = new Map<string, number>();
  for (const name of Object.values(codenames)) {
    const k = normaliseCodename(name);
    if (!k) continue;
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  return Array.from(seen.entries())
    .filter(([, c]) => c > 1)
    .map(([k]) => k);
}
