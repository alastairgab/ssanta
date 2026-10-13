import type { ReactNode } from 'react';
import type { RevealPayload } from '../types/reveal';
import type { ThemeId } from '../types/models';

export interface SealedProps {
  onOpen: () => void;
  disabled: boolean;
  label: string;
}

export interface ThemeModule {
  id: ThemeId;
  rootClass: string;
  Decor: () => ReactNode;
  Sealed: (p: SealedProps) => ReactNode;
  Card: (p: { payload: RevealPayload }) => ReactNode;
  /** Colours & fonts for the downloadable card image. */
  exportStyle: {
    background: [string, string];
    frame: string;
    paper: string;
    ink: string;
    accent: string;
    nameFont: string;
    headingFont: string;
  };
}

export function nameLength(name: string): 'normal' | 'long' | 'xlong' {
  if (name.length > 32) return 'xlong';
  if (name.length > 18) return 'long';
  return 'normal';
}

export function RecipientName({ name, className }: { name: string; className: string }) {
  return (
    <p className={`recipient-name ${className}`} data-len={nameLength(name)} data-testid="recipient-name">
      {name}
    </p>
  );
}

/** Deterministic pseudo-random decoration positions (purely visual, not security-relevant). */
export function decoPositions(count: number, seed: number) {
  let s = seed;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  return Array.from({ length: count }, () => ({ x: rnd() * 100, y: rnd() * 100, d: 6 + rnd() * 10, delay: -rnd() * 14, size: 2 + rnd() * 6, o: 0.4 + rnd() * 0.6 }));
}

export function Snow({ count = 40 }: { count?: number }) {
  return (
    <div className="snow" aria-hidden>
      {decoPositions(count, 7).map((p, i) => (
        <i
          key={i}
          style={
            {
              '--x': `${p.x}%`,
              '--d': `${p.d + 4}s`,
              '--delay': `${p.delay}s`,
              '--s': `${p.size}px`,
              '--o': p.o,
              '--b': p.size > 6 ? '1px' : '0px',
              '--drift': `${(p.y - 50) / 2}px`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

export function Holly({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 40" className={className} aria-hidden>
      <path d="M30 22c-6-10-18-12-26-8 6 1 8 6 6 10 5-2 9 1 10 5 2-4 6-6 10-7z" fill="#1e6b45" />
      <path d="M34 22c6-10 18-12 26-8-6 1-8 6-6 10-5-2-9 1-10 5-2-4-6-6-10-7z" fill="#256a4b" />
      <path d="M32 22 6 15M32 22l26-7" stroke="#123d29" strokeWidth="1" />
      <circle cx="28" cy="24" r="4.5" fill="#c62828" />
      <circle cx="36" cy="24" r="4.5" fill="#d63a3a" />
      <circle cx="32" cy="29" r="4.5" fill="#b71c1c" />
      <circle cx="27" cy="22.5" r="1.3" fill="#fff" opacity=".6" />
    </svg>
  );
}
