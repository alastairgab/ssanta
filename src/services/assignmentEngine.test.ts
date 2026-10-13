// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { generateDraw, solveAssignment } from './assignmentEngine';
import { buildConstraintModel } from './constraintModel';
import { validateAssignment, validateDraw } from './constraintValidator';
import { forbidden, forced, makeInput, names } from '../tests/fixtures';

function solved(input: ReturnType<typeof makeInput>) {
  const model = buildConstraintModel(input);
  const res = generateDraw(model);
  if (!res.ok) throw new Error(`expected a draw, got ${res.status} ${res.cause ?? ''}`);
  expect(validateDraw(model, res.assignments)).toEqual([]);
  return { model, res, map: new Map(res.assignments.map((a) => [a.giverId, a.recipientId])) };
}

describe('assignment engine — basics', () => {
  it('two participants swap', () => {
    const { map } = solved(makeInput(['Simba', 'Nala']));
    expect(map.get('Simba')).toBe('Nala');
    expect(map.get('Nala')).toBe('Simba');
  });

  it('three participants form a 3-cycle with no self-assignment', () => {
    for (let i = 0; i < 20; i++) {
      const { map } = solved(makeInput(['A', 'B', 'C']));
      for (const [g, r] of map) expect(g).not.toBe(r);
      expect(new Set(map.values()).size).toBe(3);
    }
  });

  it('handles 150 participants quickly with unique recipients', () => {
    const { res } = solved(makeInput(names(150)));
    expect(new Set(res.assignments.map((a) => a.recipientId)).size).toBe(150);
    expect(res.solver.elapsedMs).toBeLessThan(5000);
  });

  it('handles 120 participants with reciprocal prevention and households', () => {
    const ppl = names(120);
    const households = Array.from({ length: 30 }, (_, i) => ({ name: `H${i}`, members: ppl.slice(i * 4, i * 4 + 4) }));
    const { res } = solved(makeInput(ppl, { rules: { preventReciprocal: true }, households }));
    const map = new Map(res.assignments.map((a) => [a.giverId, a.recipientId]));
    for (const [g, r] of map) expect(map.get(r)).not.toBe(g);
  });

  it('produces varied draws (randomised)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const { res } = solved(makeInput(names(6)));
      seen.add(res.assignments.map((a) => a.recipientId).join(','));
    }
    expect(seen.size).toBeGreaterThan(5);
  });

  it('empty and single-participant events are rejected', () => {
    expect(solveAssignment(buildConstraintModel(makeInput(['Solo']))).status).toBe('infeasible');
  });

  it('handles duplicate display names via distinct IDs', () => {
    const input = makeInput(['id1', 'id2', 'id3']);
    input.participants = input.participants.map((p) => ({ ...p, label: 'Sam' }));
    const { res } = solved(input);
    expect(new Set(res.assignments.map((a) => a.recipientId)).size).toBe(3);
  });
});

describe('assignment engine — hard constraints', () => {
  it('respects forced assignments', () => {
    for (let i = 0; i < 10; i++) {
      const { map } = solved(makeInput(names(6), { rules: { forced: [forced('P1', 'P4'), forced('P2', 'P1')] } }));
      expect(map.get('P1')).toBe('P4');
      expect(map.get('P2')).toBe('P1');
    }
  });

  it('respects directional forbidden pairings', () => {
    for (let i = 0; i < 20; i++) {
      const { map } = solved(makeInput(['A', 'B', 'C'], { rules: { forbidden: [forbidden('A', 'B')] } }));
      expect(map.get('A')).not.toBe('B');
      // B may still buy for A: only valid 3-cycle avoiding A→B is A→C→B→A
      expect(map.get('B')).toBe('A');
    }
  });

  it('respects mutual forbidden pairings', () => {
    for (let i = 0; i < 20; i++) {
      const { map } = solved(makeInput(names(5), { rules: { forbidden: [forbidden('P1', 'P2', true)] } }));
      expect(map.get('P1')).not.toBe('P2');
      expect(map.get('P2')).not.toBe('P1');
    }
  });

  it('applies partner relationship exclusion (mutual by default)', () => {
    for (let i = 0; i < 20; i++) {
      const { map } = solved(makeInput(['Simba', 'Nala', 'Timon', 'Pumbaa'], { relationships: [{ a: 'Simba', b: 'Nala', type: 'partner' }] }));
      expect(map.get('Simba')).not.toBe('Nala');
      expect(map.get('Nala')).not.toBe('Simba');
    }
  });

  it('relationship with no-exclusion policy does not restrict', () => {
    const input = makeInput(['A', 'B'], { relationships: [{ a: 'A', b: 'B', type: 'sibling' }] });
    const { map } = solved(input);
    expect(map.get('A')).toBe('B');
  });

  it('per-relationship override can relax a partner rule', () => {
    const input = makeInput(['A', 'B'], {
      relationships: [{ a: 'A', b: 'B', type: 'partner', id: 'r1' }],
      rules: { relationshipOverrides: { r1: 'none' } },
    });
    solved(input);
  });

  it('one-way parent-child policy blocks only parent → child', () => {
    const input = makeInput(['Parent', 'Child', 'X'], {
      relationships: [{ a: 'Parent', b: 'Child', type: 'parent-child' }],
      rules: { relationshipPolicies: { partner: 'mutual', 'parent-child': 'one-way', sibling: 'none', household: 'mutual', custom: 'none' } },
    });
    for (let i = 0; i < 10; i++) {
      const { map } = solved(input);
      expect(map.get('Parent')).toBe('X');
      expect(map.get('Child')).toBe('Parent');
    }
  });

  it('respects household restrictions', () => {
    const input = makeInput(names(6), { households: [{ name: 'Smith', members: ['P1', 'P2', 'P3'] }] });
    for (let i = 0; i < 20; i++) {
      const { map } = solved(input);
      for (const g of ['P1', 'P2', 'P3']) expect(['P1', 'P2', 'P3']).not.toContain(map.get(g));
    }
  });

  it('household exception disables the restriction', () => {
    const input = makeInput(['A', 'B'], { households: [{ name: 'H', members: ['A', 'B'], id: 'h1' }], rules: { householdOverrides: { h1: false } } });
    solved(input);
  });

  it('prevents reciprocal pairs but allows longer cycles', () => {
    for (let i = 0; i < 30; i++) {
      const { map } = solved(makeInput(names(5), { rules: { preventReciprocal: true } }));
      for (const [g, r] of map) expect(map.get(r)).not.toBe(g);
    }
  });

  it('two participants with reciprocal prevention are impossible', () => {
    const model = buildConstraintModel(makeInput(['A', 'B'], { rules: { preventReciprocal: true } }));
    const res = generateDraw(model);
    expect(res.ok).toBe(false);
  });

  it('proves reciprocal infeasibility via search when only 2-cycles remain', () => {
    // A,B,C,D with only allowed: A<->B, C<->D (plus forbidden others)
    const f = [
      forbidden('A', 'C', true, 'f1'),
      forbidden('A', 'D', true, 'f2'),
      forbidden('B', 'C', true, 'f3'),
      forbidden('B', 'D', true, 'f4'),
    ];
    const model = buildConstraintModel(makeInput(['A', 'B', 'C', 'D'], { rules: { forbidden: f, preventReciprocal: true } }));
    const res = solveAssignment(model);
    expect(res.status).toBe('infeasible');
    if (res.status === 'infeasible') expect(res.cause).toBe('reciprocal');
  });

  it('hard history exclusions block previous recipients within the window', () => {
    const history = [
      { year: 2025, giver: 'A', recipient: 'B' },
      { year: 2024, giver: 'A', recipient: 'C' },
    ];
    for (let i = 0; i < 20; i++) {
      const { map } = solved(makeInput(['A', 'B', 'C', 'D'], { history, rules: { history: { mode: 'last-2', strength: 'hard', sourceSeriesIds: ['s1'], recencyDecay: 0.6, frequencyWeight: 0.5, discourageReverse: false } } }));
      expect(map.get('A')).toBe('D');
    }
  });

  it('"previous event year" means the most recent year with history, even if years were skipped', () => {
    const history = [{ year: 2022, giver: 'A', recipient: 'B' }];
    const input = makeInput(['A', 'B', 'C'], { history, rules: { history: { mode: 'last-1', strength: 'hard', sourceSeriesIds: ['s1'], recencyDecay: 0.6, frequencyWeight: 0.5, discourageReverse: false } } });
    const model = buildConstraintModel(input);
    expect(model.blocked[0]![1]!.some((r) => r.rule.kind === 'history')).toBe(true);
  });

  it('ignores history from unrelated series', () => {
    const history = [{ year: 2025, giver: 'A', recipient: 'B', series: 'office' }];
    const model = buildConstraintModel(makeInput(['A', 'B'], { history, rules: { history: { mode: 'all', strength: 'hard', sourceSeriesIds: ['s1'], recencyDecay: 0.6, frequencyWeight: 0.5, discourageReverse: false } } }));
    expect(generateDraw(model).ok).toBe(true);
  });

  it('participants joining or leaving between years are handled', () => {
    const history = [
      { year: 2025, giver: 'Old', recipient: 'A' },
      { year: 2025, giver: 'A', recipient: 'Old' },
      { year: 2025, giver: 'B', recipient: 'C' },
    ];
    const { map } = solved(makeInput(['A', 'B', 'C', 'New'], { history, rules: { history: { mode: 'all', strength: 'hard', sourceSeriesIds: ['s1'], recencyDecay: 0.6, frequencyWeight: 0.5, discourageReverse: false } } }));
    expect(map.get('B')).not.toBe('C');
    expect(map.has('Old')).toBe(false);
  });
});

describe('assignment engine — soft history', () => {
  const soft = { mode: 'all' as const, strength: 'soft' as const, sourceSeriesIds: ['s1'], recencyDecay: 0.6, frequencyWeight: 0.5, discourageReverse: false };

  it('avoids repeats when a repeat-free draw exists (proven optimal)', () => {
    const history = [
      { year: 2025, giver: 'A', recipient: 'B' },
      { year: 2025, giver: 'B', recipient: 'C' },
      { year: 2025, giver: 'C', recipient: 'D' },
      { year: 2025, giver: 'D', recipient: 'A' },
    ];
    for (let i = 0; i < 10; i++) {
      const { res } = solved(makeInput(['A', 'B', 'C', 'D'], { history, rules: { history: soft } }));
      expect(res.solver.softScore).toBe(0);
      expect(res.solver.repeatCount).toBe(0);
      expect(res.solver.provenOptimal).toBe(true);
    }
  });

  it('allows unavoidable repeats but minimises them and prefers older repeats', () => {
    // Two people: must repeat. With 3 people and history covering both 3-cycles, pick the older cycle.
    const history = [
      { year: 2025, giver: 'A', recipient: 'B' },
      { year: 2025, giver: 'B', recipient: 'C' },
      { year: 2025, giver: 'C', recipient: 'A' },
      { year: 2020, giver: 'A', recipient: 'C' },
      { year: 2020, giver: 'C', recipient: 'B' },
      { year: 2020, giver: 'B', recipient: 'A' },
    ];
    for (let i = 0; i < 10; i++) {
      const { map, res } = solved(makeInput(['A', 'B', 'C'], { history, rules: { history: soft } }));
      expect(map.get('A')).toBe('C');
      expect(res.solver.repeatCount).toBe(3);
    }
  });

  it('soft optimisation still respects reciprocal prevention', () => {
    const history = [
      { year: 2025, giver: 'P1', recipient: 'P3' },
      { year: 2025, giver: 'P3', recipient: 'P5' },
    ];
    for (let i = 0; i < 10; i++) {
      const { map } = solved(makeInput(names(5), { history, rules: { history: soft, preventReciprocal: true } }));
      for (const [g, r] of map) expect(map.get(r)).not.toBe(g);
    }
  });
});

describe('validator', () => {
  it('rejects invalid draws', () => {
    const model = buildConstraintModel(makeInput(['A', 'B', 'C'], { rules: { forbidden: [forbidden('A', 'B')] } }));
    expect(validateAssignment(model, [0, 2, 1])).not.toEqual([]); // A→A self
    expect(validateAssignment(model, [1, 2, 0])).not.toEqual([]); // A→B forbidden
    expect(validateAssignment(model, [2, 2, 0])).not.toEqual([]); // C receives twice
    expect(validateAssignment(model, [2, 0, 1])).toEqual([]);
  });
});

describe('assignment engine — performance', () => {
  it('100 people, 3 years of hard history, households and no swaps', () => {
    const ppl = names(100);
    const history: { year: number; giver: string; recipient: string }[] = [];
    for (const [year, shift] of [[2025, 7], [2024, 13], [2023, 29]] as const) {
      ppl.forEach((g, i) => history.push({ year, giver: g, recipient: ppl[(i + shift) % 100]! }));
    }
    const households = Array.from({ length: 25 }, (_, i) => ({ name: `H${i}`, members: ppl.slice(i * 4, i * 4 + 4) }));
    const start = Date.now();
    const { res } = solved(
      makeInput(ppl, {
        history,
        households,
        rules: { preventReciprocal: true, history: { mode: 'last-3', strength: 'hard', sourceSeriesIds: ['s1'], recencyDecay: 0.6, frequencyWeight: 0.5, discourageReverse: false } },
      }),
    );
    expect(res.solver.repeatCount).toBe(0);
    expect(Date.now() - start).toBeLessThan(5000);
  });

  it('120 people with soft history over 5 years is optimised quickly', () => {
    const ppl = names(120);
    const history: { year: number; giver: string; recipient: string }[] = [];
    for (let y = 0; y < 5; y++) ppl.forEach((g, i) => history.push({ year: 2025 - y, giver: g, recipient: ppl[(i + 1 + y * 3) % 120]! }));
    const { res } = solved(
      makeInput(ppl, { history, rules: { preventReciprocal: true, history: { mode: 'all', strength: 'soft', sourceSeriesIds: ['s1'], recencyDecay: 0.6, frequencyWeight: 0.5, discourageReverse: true } } }),
    );
    expect(res.solver.softScore).toBe(0);
  });
});
