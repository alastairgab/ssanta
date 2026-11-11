// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  decryptWithPrivateKey,
  encryptToPublicKey,
  extractPacket,
  generateRelayKeyPair,
  openSealedJson,
  passwordDecrypt,
  passwordEncrypt,
  sealJson,
} from './cryptography';
import { base64UrlToBytes, bytesToBase64Url, utf8 } from '../utils/base64';
import {
  appBaseUrl,
  buildRevealPayload,
  createRevealLink,
  LinkError,
  openRevealLink,
  openRevealUrl,
  parseFragment,
} from './revealLinks';
import type { DrawVersion, ExchangeEvent, Participant } from '../types/models';
import { defaultRules } from './storage';

describe('sealed payloads (AES-256-GCM)', () => {
  it('round-trips JSON', async () => {
    const s = await sealJson('reveal', { hello: 'world', n: 1 });
    expect(await openSealedJson('reveal', s.ciphertext, s.key)).toEqual({ hello: 'world', n: 1 });
  });

  it('uses a distinct key and IV for every payload', async () => {
    const a = await sealJson('reveal', { x: 1 });
    const b = await sealJson('reveal', { x: 1 });
    expect(a.key).not.toBe(b.key);
    expect(a.ciphertext.slice(0, 16)).not.toBe(b.ciphertext.slice(0, 16)); // IV prefix differs
    expect(base64UrlToBytes(a.key).length).toBe(32);
  });

  it('rejects the wrong key', async () => {
    const a = await sealJson('reveal', { x: 1 });
    const b = await sealJson('reveal', { x: 2 });
    await expect(openSealedJson('reveal', a.ciphertext, b.key)).rejects.toMatchObject({ code: 'decrypt-failed' });
  });

  it('detects modified ciphertext', async () => {
    const a = await sealJson('reveal', { x: 1 });
    const bytes = base64UrlToBytes(a.ciphertext);
    bytes[bytes.length - 5] = bytes[bytes.length - 5]! ^ 0x01;
    await expect(openSealedJson('reveal', bytesToBase64Url(bytes), a.key)).rejects.toMatchObject({ code: 'decrypt-failed' });
  });

  it('rejects missing IV / truncated data and junk', async () => {
    const a = await sealJson('reveal', { x: 1 });
    await expect(openSealedJson('reveal', a.ciphertext.slice(0, 10), a.key)).rejects.toMatchObject({ code: 'malformed' });
    await expect(openSealedJson('reveal', 'not*valid', a.key)).rejects.toMatchObject({ code: 'malformed' });
    await expect(openSealedJson('reveal', a.ciphertext, a.key.slice(0, 20))).rejects.toMatchObject({ code: 'malformed' });
  });

  it('binds the payload kind (a question link cannot be opened as a reveal)', async () => {
    const a = await sealJson('question', { x: 1 });
    await expect(openSealedJson('reveal', a.ciphertext, a.key)).rejects.toMatchObject({ code: 'decrypt-failed' });
  });

  it('is not plain base64 of the content', async () => {
    const a = await sealJson('reveal', { secret: 'Nala' });
    let decoded = '';
    try {
      decoded = new TextDecoder().decode(base64UrlToBytes(a.ciphertext));
    } catch {
      /* binary */
    }
    expect(decoded).not.toContain('Nala');
  });
});

describe('relay packets (ECDH → AES-GCM)', () => {
  it('only the organiser key can decrypt', async () => {
    const organiser = await generateRelayKeyPair();
    const other = await generateRelayKeyPair();
    const packet = await encryptToPublicKey(organiser.publicKeyJwk, { t: 'hi' });
    expect(await decryptWithPrivateKey(organiser.privateKeyJwk, `Hey! here it is:\n${packet}\nthanks`)).toEqual({ t: 'hi' });
    await expect(decryptWithPrivateKey(other.privateKeyJwk, packet)).rejects.toThrow();
  });

  it('rejects corrupted packets', async () => {
    const organiser = await generateRelayKeyPair();
    const packet = await encryptToPublicKey(organiser.publicKeyJwk, { t: 'hi' });
    const corrupted = packet.slice(0, -6) + (packet.endsWith('A') ? 'BBBBBB' : 'AAAAAA');
    await expect(decryptWithPrivateKey(organiser.privateKeyJwk, corrupted)).rejects.toThrow();
    await expect(decryptWithPrivateKey(organiser.privateKeyJwk, 'random text')).rejects.toThrow(/No Secret Santa message/);
    expect(extractPacket('nothing here')).toBeNull();
  });
});

describe('password encryption', () => {
  it('round-trips and rejects wrong passwords', async () => {
    const enc = await passwordEncrypt('correct horse', utf8.encode('data'), 100_000);
    expect(utf8.decode(await passwordDecrypt('correct horse', enc))).toBe('data');
    await expect(passwordDecrypt('wrong', enc)).rejects.toMatchObject({ code: 'wrong-password' });
  });
});

function fixtureDraw() {
  const people: Participant[] = ['Simba', 'Nala', 'Timon'].map((n) => ({
    schemaVersion: 1,
    id: `p_${n}`,
    displayName: n,
    active: true,
    createdAt: '',
    updatedAt: '',
    notes: `secret organiser note about ${n}`,
  }));
  const event: ExchangeEvent = {
    schemaVersion: 1,
    id: 'ev1',
    seriesId: 's1',
    name: 'Family Christmas 2026',
    year: 2026,
    currency: 'AUD',
    budget: 50,
    theme: 'present',
    participantIds: people.map((p) => p.id),
    status: 'draw-confirmed',
    rules: defaultRules('s1'),
    codenamesEnabled: true,
    codenames: { p_Simba: 'Agent Snowflake', p_Nala: 'Captain Tinsel', p_Timon: 'Frosty Fox' },
    concealAssignments: true,
    includeWishlists: true,
    organiserNotes: 'ORGANISER ONLY',
    createdAt: '',
    updatedAt: '',
  };
  const draw: DrawVersion = {
    schemaVersion: 1,
    id: 'dr1',
    eventId: 'ev1',
    version: 2,
    status: 'confirmed',
    reason: 'initial',
    createdAt: '',
    distribution: {},
    snapshot: {
      schemaVersion: 1,
      eventId: 'ev1',
      seriesId: 's1',
      eventName: event.name,
      year: 2026,
      version: 2,
      participants: people.map((p) => ({ id: p.id, displayName: p.displayName, codename: event.codenames[p.id] })),
      assignments: [
        { giverId: 'p_Simba', recipientId: 'p_Nala' },
        { giverId: 'p_Nala', recipientId: 'p_Timon' },
        { giverId: 'p_Timon', recipientId: 'p_Simba' },
      ],
      rules: event.rules,
      generatedAt: '',
      solver: { method: 'matching', provenOptimal: true, softScore: 0, repeatCount: 0, nodesExplored: 1, elapsedMs: 1 },
    },
  };
  return { people: new Map(people.map((p) => [p.id, p])), event, draw };
}

describe('reveal links', () => {
  it('creates a self-contained link that decrypts to only the giver’s assignment', async () => {
    const { people, event, draw } = fixtureDraw();
    const links: string[] = [];
    for (const giverId of ['p_Simba', 'p_Nala', 'p_Timon']) {
      const payload = buildRevealPayload({
        event,
        draw,
        giverId,
        participants: people,
        issueNumber: 1,
        recipientWishlist:
          giverId === 'p_Simba'
            ? { schemaVersion: 1, id: 'x', eventId: 'ev1', participantId: 'p_Nala', interests: 'Books', links: [], organiserNotes: 'PRIVATE', source: 'organiser', updatedAt: '' }
            : undefined,
      });
      links.push(await createRevealLink(payload, 'https://user.github.io/secret-santa/'));
    }
    const first = links[0]!;
    expect(first.startsWith('https://user.github.io/secret-santa/#r=2.')).toBe(true);
    // Nothing sensitive in the path or query (everything after # stays in the browser)
    const u = new URL(first);
    expect(u.search).toBe('');
    expect(u.pathname).toBe('/secret-santa/');

    const p = await openRevealUrl(first);
    expect(p.g).toBe('Simba');
    expect(p.r).toBe('Nala');
    expect(p.gc).toBe('Agent Snowflake');
    expect(p.dv).toBe(2);
    expect(p.th).toBe('present');
    expect(p.wl?.interests).toBe('Books');
    const json = JSON.stringify(p);
    // Isolation: no other assignments, organiser notes or private wishlist notes
    expect(json).not.toContain('Timon');
    expect(json).not.toContain('ORGANISER ONLY');
    expect(json).not.toContain('PRIVATE');
    expect(json).not.toContain('secret organiser note');

    // A link's key cannot open another participant's link
    const f0 = parseFragment(new URL(links[0]!).hash)!;
    const f1 = parseFragment(new URL(links[1]!).hash)!;
    await expect(openRevealLink({ ...f1, key: f0.key })).rejects.toBeInstanceOf(LinkError);
  });

  it('handles corrupted and malformed URLs safely', async () => {
    const { people, event, draw } = fixtureDraw();
    const link = await createRevealLink(buildRevealPayload({ event, draw, giverId: 'p_Simba', participants: people, issueNumber: 1 }), 'https://x.test/');
    const hash = new URL(link).hash;
    expect(() => parseFragment('#r=1.abc')).toThrow(LinkError);
    expect(() => parseFragment('#r=%E0%A4%A')).toThrow(LinkError);
    expect(() => parseFragment('#r=99.a.b')).toThrow(/newer version/);
    expect(parseFragment('#/events/123')).toBeNull();
    const truncated = parseFragment(hash.slice(0, hash.length - 10))!;
    await expect(openRevealLink(truncated)).rejects.toBeInstanceOf(LinkError);
    const f = parseFragment(hash)!;
    await expect(openRevealLink({ ...f, ciphertext: f.ciphertext.replace(/^./, (c) => (c === 'A' ? 'B' : 'A')) })).rejects.toBeInstanceOf(LinkError);
  });

  it('opening a link needs no organiser storage (pure function of the URL)', async () => {
    const { people, event, draw } = fixtureDraw();
    const link = await createRevealLink(buildRevealPayload({ event, draw, giverId: 'p_Timon', participants: people, issueNumber: 3 }), 'https://x.test/app/');
    // Simulate a different browser: only the URL string is available.
    const p = await openRevealUrl(String(link));
    expect(p.r).toBe('Simba');
    expect(p.iss).toBe(3);
  });

  it('computes the app base URL without query or fragment', () => {
    expect(appBaseUrl('https://u.github.io/secret-santa/?x=1#/events')).toBe('https://u.github.io/secret-santa/');
  });
});

describe('compact links (format 2)', () => {
  it('compresses and restores P-256 public keys exactly', async () => {
    const { compressPublicJwk, decompressPublicJwk } = await import('./cryptography');
    for (let i = 0; i < 20; i++) {
      const { publicKeyJwk, privateKeyJwk } = await generateRelayKeyPair();
      const c = compressPublicJwk(publicKeyJwk);
      expect(c).toHaveLength(44);
      const restored = decompressPublicJwk(c);
      expect(restored.x).toBe(publicKeyJwk.x);
      expect(restored.y).toBe(publicKeyJwk.y);
      // The restored key really works for encryption to the organiser
      const packet = await encryptToPublicKey(restored, { ok: i });
      expect(await decryptWithPrivateKey(privateKeyJwk, packet)).toEqual({ ok: i });
    }
    expect(() => decompressPublicJwk('A'.repeat(44))).toThrow();
  });

  it('is much shorter than format 1 and decodes to the same information', async () => {
    const { people, event, draw } = fixtureDraw();
    const keys = await generateRelayKeyPair();
    const ev = { ...event, relayKeys: { ...keys, createdAt: '' } };
    const v2 = buildRevealPayload({ event: ev, draw, giverId: 'p_Simba', participants: people, issueNumber: 1 });
    expect(v2.v).toBe(2);
    const v1 = { ...v2, v: 1 as const, eid: ev.id + 'x'.repeat(24), gid: 'p_' + 'y'.repeat(24), at: new Date().toISOString() };
    const short = await createRevealLink(v2, 'https://alastairgab.github.io/ssanta/');
    const long = await createRevealLink(v1, 'https://alastairgab.github.io/ssanta/');
    expect(short).toMatch(/#r=2\./);
    expect(short.length).toBeLessThan(long.length - 120);
    const opened = await openRevealUrl(short);
    expect(opened).toMatchObject({ v: 2, g: 'Simba', r: 'Nala', dv: 2, gi: draw.snapshot.participants.findIndex((p) => p.id === 'p_Simba') });
    expect(opened.rk?.x).toBe(keys.publicKeyJwk.x);
    expect(opened.eid).toBeUndefined();
  });
});
