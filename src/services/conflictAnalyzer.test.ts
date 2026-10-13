// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { analyzeConstraints, applyRuleChanges } from './conflictAnalyzer';
import { buildConstraintModel } from './constraintModel';
import { generateDraw } from './assignmentEngine';
import { forbidden, forced, makeInput } from '../tests/fixtures';

describe('direct contradictions', () => {
  it('detects a giver forced to two people', () => {
    const d = analyzeConstraints(makeInput(['A', 'B', 'C'], { rules: { forced: [forced('A', 'B'), forced('A', 'C')] } }));
    expect(d.issues.map((i) => i.code)).toContain('forced-giver-duplicate');
    expect(d.feasible).toBe(false);
  });

  it('detects two givers forced to the same recipient', () => {
    const d = analyzeConstraints(makeInput(['A', 'B', 'C'], { rules: { forced: [forced('A', 'C'), forced('B', 'C')] } }));
    expect(d.issues.map((i) => i.code)).toContain('forced-recipient-duplicate');
  });

  it('detects forced self-assignment', () => {
    const d = analyzeConstraints(makeInput(['A', 'B', 'C'], { rules: { forced: [forced('A', 'A')] } }));
    expect(d.issues.map((i) => i.code)).toContain('forced-self');
  });

  it('detects forced pairing blocked by a forbidden rule, relationship or history', () => {
    const d1 = analyzeConstraints(makeInput(['A', 'B', 'C'], { rules: { forced: [forced('A', 'B')], forbidden: [forbidden('A', 'B')] } }));
    expect(d1.issues.find((i) => i.code === 'forced-blocked')?.message).toMatch(/forbidden/);
    const d2 = analyzeConstraints(makeInput(['A', 'B', 'C'], { rules: { forced: [forced('A', 'B')] }, relationships: [{ a: 'A', b: 'B', type: 'partner' }] }));
    expect(d2.issues.find((i) => i.code === 'forced-blocked')?.message).toMatch(/partner/);
    const d3 = analyzeConstraints(
      makeInput(['A', 'B', 'C'], {
        rules: { forced: [forced('A', 'B')], history: { mode: 'last-1', strength: 'hard', sourceSeriesIds: ['s1'], recencyDecay: 0.6, frequencyWeight: 0.5, discourageReverse: false } },
        history: [{ year: 2025, giver: 'A', recipient: 'B' }],
      }),
    );
    expect(d3.issues.find((i) => i.code === 'forced-blocked')?.message).toMatch(/2025/);
  });

  it('suggests removing the conflicting rule or the forced pairing, and does not modify rules', () => {
    const input = makeInput(['A', 'B', 'C'], { rules: { forced: [forced('A', 'B', 'f1')], forbidden: [forbidden('A', 'B', false, 'x1')] } });
    const before = JSON.stringify(input.rules);
    const d = analyzeConstraints(input);
    expect(JSON.stringify(input.rules)).toBe(before);
    const kinds = d.remedies.map((r) => r.changes.map((c) => c.kind).join('+'));
    expect(kinds).toContain('disable-forced');
    expect(kinds).toContain('disable-forbidden');
  });
});

describe('local and global diagnostics', () => {
  it('explains a participant with no eligible recipients, naming each blocker', () => {
    const input = makeInput(['Simba', 'Nala', 'Timon', 'Pumbaa', 'Rafiki'], {
      relationships: [{ a: 'Simba', b: 'Nala', type: 'partner' }],
      history: [{ year: 2025, giver: 'Simba', recipient: 'Timon' }],
      rules: {
        forced: [forced('Rafiki', 'Pumbaa')],
        forbidden: [forbidden('Simba', 'Rafiki')],
        history: { mode: 'last-1', strength: 'hard', sourceSeriesIds: ['s1'], recencyDecay: 0.6, frequencyWeight: 0.5, discourageReverse: false },
      },
    });
    const d = analyzeConstraints(input);
    expect(d.feasible).toBe(false);
    const msg = d.stuckGivers.find((s) => s.participantId === 'Simba')?.message ?? '';
    expect(msg).toMatch(/Simba cannot be assigned a recipient/);
    expect(msg).toMatch(/Nala is excluded by the partner relationship/);
    expect(msg).toMatch(/Timon is excluded because of last time's assignment \(2025\)/);
    expect(msg).toMatch(/Pumbaa is already required as Rafiki's recipient/);
  });

  it('detects global household capacity failure (Hall violation) with a supported explanation', () => {
    const input = makeInput(['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3'], {
      households: [{ name: 'Household A', members: ['A1', 'A2', 'A3', 'A4'], id: 'hA' }],
    });
    const d = analyzeConstraints(input);
    expect(d.feasible).toBe(false);
    expect(d.stuckGivers).toHaveLength(0);
    expect(d.global?.message).toMatch(/4 participants belong to Household A/);
    expect(d.global?.message).toMatch(/only 3 eligible recipients/);
    expect(d.remedies[0]!.changes[0]).toEqual({ kind: 'household-exception', id: 'hA' });
  });

  it('detects reciprocal-only infeasibility and proposes allowing reciprocal pairs', () => {
    const f = [forbidden('A', 'C', true, 'f1'), forbidden('A', 'D', true, 'f2'), forbidden('B', 'C', true, 'f3'), forbidden('B', 'D', true, 'f4')];
    const d = analyzeConstraints(makeInput(['A', 'B', 'C', 'D'], { rules: { forbidden: f, preventReciprocal: true } }));
    expect(d.reciprocalOnly).toBeTruthy();
    expect(d.remedies[0]!.changes).toEqual([{ kind: 'allow-reciprocal' }]);
  });

  it('suggests relaxing history windows and soft history', () => {
    const history = [
      { year: 2025, giver: 'A', recipient: 'B' },
      { year: 2025, giver: 'B', recipient: 'C' },
      { year: 2025, giver: 'C', recipient: 'A' },
      { year: 2024, giver: 'A', recipient: 'C' },
      { year: 2024, giver: 'C', recipient: 'B' },
      { year: 2024, giver: 'B', recipient: 'A' },
    ];
    const d = analyzeConstraints(
      makeInput(['A', 'B', 'C'], { history, rules: { history: { mode: 'last-2', strength: 'hard', sourceSeriesIds: ['s1'], recencyDecay: 0.6, frequencyWeight: 0.5, discourageReverse: false } } }),
    );
    expect(d.feasible).toBe(false);
    const kinds = d.remedies.map((r) => r.changes[0]!.kind);
    expect(kinds).toContain('history-soft');
    expect(kinds).toContain('history-window');
    expect(d.remedySearch.exhaustiveSingles).toBe(true);
  });

  it('only proposes remedies that actually produce a valid draw', () => {
    const input = makeInput(['A1', 'A2', 'A3', 'B1'], {
      households: [{ name: 'H', members: ['A1', 'A2', 'A3'], id: 'h' }],
      rules: { forbidden: [forbidden('B1', 'A1', false, 'x')] },
    });
    const d = analyzeConstraints(input);
    expect(d.remedies.length).toBeGreaterThan(0);
    for (const remedy of d.remedies) {
      const rules = applyRuleChanges(input.rules, remedy.changes);
      expect(generateDraw(buildConstraintModel({ ...input, rules })).ok).toBe(true);
    }
  });

  it('falls back to two-change remedies when no single change works', () => {
    // A must avoid both B (partner) and C (forbidden); with only 3 people A is stuck → needs one change.
    // Make it need two: two independent stuck givers.
    const input = makeInput(['A', 'B', 'C', 'D'], {
      rules: {
        forbidden: [forbidden('A', 'B', false, 'x1'), forbidden('A', 'C', false, 'x2'), forbidden('A', 'D', false, 'x3'), forbidden('B', 'A', false, 'y1'), forbidden('B', 'C', false, 'y2'), forbidden('B', 'D', false, 'y3')],
      },
    });
    const d = analyzeConstraints(input);
    expect(d.remedies.length).toBeGreaterThan(0);
    expect(d.remedies.every((r) => r.changes.length === 2)).toBe(true);
    expect(d.remedySearch.exhaustiveSingles).toBe(true);
  });

  it('reports feasible configurations as feasible', () => {
    expect(analyzeConstraints(makeInput(['A', 'B', 'C'])).feasible).toBe(true);
  });
});
