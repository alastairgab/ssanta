// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseCsv, toCsv } from '../utils/csv';
import { canonicalJson } from '../utils/canonicalJson';
import { parseBulkNames, parseHistoryCsv, parseParticipantCsv, resolveName } from './csvImport';
import { fillCodenames, findDuplicateCodenames, generateUniqueCodename } from './codenames';
import { safeExternalUrl } from './wishlist';
import { planWithdrawalRepair } from './drawRepair';
import { forbidden, makeInput, names } from '../tests/fixtures';
import { secureRandomInt, secureShuffle } from '../utils/random';
import type { Participant } from '../types/models';

describe('csv', () => {
  it('parses quotes, commas and newlines', () => {
    expect(parseCsv('a,"b,c","d ""e"""\r\n1,2,3\n')).toEqual([
      ['a', 'b,c', 'd "e"'],
      ['1', '2', '3'],
    ]);
  });
  it('neutralises formula injection on export', () => {
    expect(toCsv([['=HYPERLINK("x")', '+1', 'ok']])).toBe(`"'=HYPERLINK(""x"")",'+1,ok\r\n`);
  });
  it('parses participant and history imports', () => {
    expect(parseParticipantCsv('name,household\nSimba,Pride Rock\nNala,Pride Rock')).toEqual([
      { displayName: 'Simba', household: 'Pride Rock', nickname: undefined, notes: undefined, disambiguator: undefined },
      { displayName: 'Nala', household: 'Pride Rock', nickname: undefined, notes: undefined, disambiguator: undefined },
    ]);
    expect(parseBulkNames('Simba\nNala\n\n- Timon')).toEqual(['Simba', 'Nala', 'Timon']);
    expect(parseBulkNames('Simba, Nala; Timon')).toEqual(['Simba', 'Nala', 'Timon']);
    const rows = parseHistoryCsv('year,giver,recipient\n2025,Simba,Nala\nbad,Nala,Simba');
    expect(rows[0]).toEqual({ line: 2, year: 2025, giverName: 'Simba', recipientName: 'Nala' });
    expect(rows[1]!.year).toBeNull();
  });
  it('resolves names without guessing between duplicates', () => {
    const p = (id: string, displayName: string, disambiguator?: string): Participant => ({ schemaVersion: 1, id, displayName, disambiguator, active: true, createdAt: '', updatedAt: '' });
    const people = [p('1', 'Sam', 'Mum’s side'), p('2', 'Sam', 'Dad’s side'), p('3', 'Nala')];
    expect(resolveName('nala', people)).toEqual({ status: 'matched', id: '3' });
    expect(resolveName('Sam', people)).toEqual({ status: 'ambiguous', candidates: ['1', '2'] });
    expect(resolveName('Sam (Dad’s side)', people)).toEqual({ status: 'matched', id: '2' });
    expect(resolveName('Zazu', people)).toEqual({ status: 'unknown' });
  });
});

describe('canonical json', () => {
  it('sorts keys and omits undefined', () => {
    expect(canonicalJson({ b: 1, a: { d: [1, 'x'], c: undefined } })).toBe('{"a":{"d":[1,"x"]},"b":1}');
  });
});

describe('codenames', () => {
  it('generates unique codenames within an event and keeps existing ones', () => {
    const ids = Array.from({ length: 200 }, (_, i) => `p${i}`);
    const filled = fillCodenames(ids, { p0: 'Agent Snowflake' });
    expect(filled.p0).toBe('Agent Snowflake');
    expect(findDuplicateCodenames(filled)).toEqual([]);
    expect(new Set(Object.values(filled)).size).toBe(200);
    expect(generateUniqueCodename(['agent snowflake'])).not.toBe('Agent Snowflake');
  });
});

describe('url safety', () => {
  it('allows only http(s) links', () => {
    expect(safeExternalUrl('javascript:alert(1)')).toBeNull();
    expect(safeExternalUrl('data:text/html,hi')).toBeNull();
    expect(safeExternalUrl('https://example.com/a')).toBe('https://example.com/a');
  });
});

describe('secure random', () => {
  it('stays in range and shuffles', () => {
    for (let i = 0; i < 1000; i++) {
      const x = secureRandomInt(7);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(7);
    }
    expect(secureShuffle([1, 2, 3, 4]).sort()).toEqual([1, 2, 3, 4]);
  });
});

describe('repair solver', () => {
  it('minimises changes when one participant withdraws from a long cycle', () => {
    const ppl = names(8);
    const previous = ppl.map((g, i) => ({ giverId: g, recipientId: ppl[(i + 1) % ppl.length]! }));
    const res = planWithdrawalRepair(makeInput(ppl), previous, ['P4']);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.repair.changed).toEqual([{ giverId: 'P3', from: 'P4', to: 'P5' }]);
    expect(res.repair.unchanged).toHaveLength(6);
  });

  it('makes more changes when constraints require it, and validates them', () => {
    const ppl = ['A', 'B', 'C', 'D', 'E'];
    const previous = [
      { giverId: 'A', recipientId: 'B' },
      { giverId: 'B', recipientId: 'C' },
      { giverId: 'C', recipientId: 'D' },
      { giverId: 'D', recipientId: 'E' },
      { giverId: 'E', recipientId: 'A' },
    ];
    // C withdraws; B would naturally take D but B→D is forbidden.
    const res = planWithdrawalRepair(makeInput(ppl, { rules: { forbidden: [forbidden('B', 'D')] } }), previous, ['C']);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.repair.changed.length).toBeGreaterThan(1);
    const map = new Map(res.repair.proposed.map((a) => [a.giverId, a.recipientId]));
    expect(map.get('B')).not.toBe('D');
    expect(new Set(map.values()).size).toBe(4);
  });

  it('reports impossible repairs', () => {
    const res = planWithdrawalRepair(makeInput(['A', 'B', 'C'], { rules: { preventReciprocal: true } }), [
      { giverId: 'A', recipientId: 'B' },
      { giverId: 'B', recipientId: 'C' },
      { giverId: 'C', recipientId: 'A' },
    ], ['C']);
    expect(res.ok).toBe(false);
  });
});
