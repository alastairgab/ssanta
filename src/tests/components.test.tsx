import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import RevealPage from '../reveal/RevealPage';
import { ConstraintMatrix } from '../components/constraints/ConstraintMatrix';
import { buildConstraintModel } from '../services/constraintModel';
import { makeInput } from './fixtures';
import type { RevealPayload } from '../types/reveal';
import { AssignmentTable } from '../components/draws/AssignmentTable';
import { DiagnosisPanel } from '../components/constraints/DiagnosisPanel';
import { analyzeConstraints } from '../services/conflictAnalyzer';

const payload = (over: Partial<RevealPayload> = {}): RevealPayload => ({
  v: 1,
  eid: 'e',
  did: 'd',
  dv: 3,
  iss: 2,
  gid: 'g',
  g: 'Simba',
  r: 'Nala',
  en: 'Family Christmas 2026',
  yr: 2026,
  th: 'classic',
  at: '2026-01-01T00:00:00Z',
  ...over,
});

function mockReducedMotion(reduce: boolean) {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: reduce && q.includes('reduce'),
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

describe('RevealPage', () => {
  it('does not reveal the recipient until the participant interacts', async () => {
    mockReducedMotion(true);
    render(<RevealPage payload={payload()} />);
    expect(screen.getByRole('heading', { name: 'Hi Simba!' })).toBeInTheDocument();
    expect(screen.queryByText('Nala')).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId('reveal-trigger'));
    expect(screen.getByTestId('recipient-name')).toHaveTextContent('Nala');
    expect(screen.getByText('Family Christmas 2026 — Draw Version 3 · Link #2')).toBeInTheDocument();
  });

  it('works with the keyboard and focuses the revealed card', async () => {
    mockReducedMotion(true);
    render(<RevealPage payload={payload({ th: 'elegant', gc: 'Captain Tinsel' })} />);
    expect(screen.getByRole('heading', { name: 'Welcome back, Captain Tinsel.' })).toBeInTheDocument();
    screen.getByTestId('reveal-trigger').focus();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByTestId('revealed-card')).toHaveFocus();
  });

  it('plays the opening animation before revealing when motion is allowed', async () => {
    vi.useFakeTimers();
    mockReducedMotion(false);
    render(<RevealPage payload={payload({ th: 'present' })} />);
    act(() => screen.getByTestId('reveal-trigger').click());
    expect(screen.queryByTestId('recipient-name')).not.toBeInTheDocument();
    expect(document.querySelector('.phase-opening')).not.toBeNull();
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByTestId('recipient-name')).toHaveTextContent('Nala');
    vi.useRealTimers();
  });

  it('renders every theme and marks long names', async () => {
    mockReducedMotion(true);
    for (const th of ['classic', 'present', 'advent', 'elegant'] as const) {
      const { unmount } = render(<RevealPage payload={payload({ th, r: 'A very very long recipient name indeed here' })} />);
      await userEvent.click(screen.getByTestId('reveal-trigger'));
      expect(screen.getByTestId('recipient-name')).toHaveAttribute('data-len', 'xlong');
      unmount();
    }
  });

  it('renders hostile text as text, never HTML, and drops unsafe links', async () => {
    mockReducedMotion(true);
    render(<RevealPage payload={payload({ r: '<img src=x onerror=alert(1)>', wl: { notes: '<script>x</script>', links: ['javascript:alert(1)', 'https://ok.example/'] } })} />);
    await userEvent.click(screen.getByTestId('reveal-trigger'));
    expect(screen.getByTestId('recipient-name').textContent).toBe('<img src=x onerror=alert(1)>');
    expect(document.querySelector('img[src=x]')).toBeNull();
    expect(document.querySelector('a[href^="javascript"]')).toBeNull();
    expect(screen.getByRole('link', { name: 'ok.example' })).toBeInTheDocument();
  });
});

describe('ConstraintMatrix', () => {
  it('explains why a pairing is unavailable', async () => {
    const model = buildConstraintModel(makeInput(['Simba', 'Nala', 'Timon'], { relationships: [{ a: 'Simba', b: 'Nala', type: 'partner' }] }));
    render(<ConstraintMatrix model={model} />);
    await userEvent.click(screen.getByRole('button', { name: 'Simba to Nala: Relationship restriction' }));
    expect(screen.getByText(/Simba can't buy for Nala: Nala is excluded by the partner relationship/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Simba to Timon: Allowed' })).toBeInTheDocument();
  });
});

describe('AssignmentTable concealment', () => {
  it('hides recipients until individually revealed', async () => {
    render(<AssignmentTable assignments={[{ giverId: 'a', recipientId: 'b' }]} nameOf={(id) => (id === 'a' ? 'Ann' : 'Bob')} concealed />);
    expect(screen.queryByText('Bob')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show who Ann buys for' }));
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });
});

describe('DiagnosisPanel', () => {
  it('shows explanations and remedies without changing rules until confirmed', async () => {
    const input = makeInput(['A1', 'A2', 'A3', 'B'], { households: [{ name: 'Smiths', members: ['A1', 'A2', 'A3'], id: 'h' }] });
    const diagnosis = analyzeConstraints(input);
    render(<DiagnosisPanel diagnosis={diagnosis} eventId="ev" />);
    expect(screen.getByText(/3 participants belong to Smiths/)).toBeInTheDocument();
    expect(screen.getByText('Let members of Smiths buy for each other this year')).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: /Review & apply/ })[0]!);
    // A confirmation step is required — nothing has been applied yet
    expect(screen.getByRole('button', { name: 'Apply change' })).toBeInTheDocument();
  });
});
