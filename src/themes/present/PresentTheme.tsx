import { decoPositions, RecipientName, type ThemeModule } from '../shared';

function Sparkles() {
  return (
    <div className="sparkles pointer-events-none fixed inset-0 z-0" aria-hidden>
      {decoPositions(36, 3).map((p, i) => (
        <i key={i} style={{ '--x': `${p.x}%`, '--y': `${p.y}%`, '--d': `${2 + (p.d % 4)}s`, '--delay': `${p.delay / 3}s` } as React.CSSProperties} />
      ))}
    </div>
  );
}

function Bow() {
  return (
    <svg viewBox="0 0 130 70" className="bow" aria-hidden>
      <defs>
        <linearGradient id="bowg" x1="0" x2="1">
          <stop offset="0" stopColor="#c8962e" />
          <stop offset=".5" stopColor="#f6dc8a" />
          <stop offset="1" stopColor="#c8962e" />
        </linearGradient>
      </defs>
      <path d="M65 52C40 20 6 10 8 34c2 20 34 22 57 18z" fill="url(#bowg)" stroke="#a87920" strokeWidth="1.5" />
      <path d="M65 52c25-32 59-42 57-18-2 20-34 22-57 18z" fill="url(#bowg)" stroke="#a87920" strokeWidth="1.5" />
      <path d="M58 54l-14 16M72 54l14 16" stroke="#c8962e" strokeWidth="9" strokeLinecap="round" />
      <ellipse cx="65" cy="52" rx="11" ry="9" fill="#e7bf5b" stroke="#a87920" strokeWidth="1.5" />
    </svg>
  );
}

export const presentTheme: ThemeModule = {
  id: 'present',
  rootClass: 'theme-present',
  Decor: Sparkles,
  Sealed: ({ onOpen, disabled, label }) => (
    <button type="button" className="reveal-object" onClick={onOpen} disabled={disabled} aria-label={label} data-testid="reveal-trigger">
      <div className="present">
        <div className="present-glow" />
        <div className="box">
          <div className="ribbon-v" />
          <div className="ribbon-h" />
        </div>
        <div className="lid">
          <div className="ribbon-v" />
        </div>
        <Bow />
      </div>
    </button>
  ),
  Card: ({ payload }) => (
    <div className="present-card mx-auto w-full max-w-lg px-6 py-10 text-center sm:px-10">
      <p className="relative font-festive text-2xl font-bold text-[#9c1c1c]">Surprise!</p>
      <p className="relative mt-4 text-sm font-semibold uppercase tracking-[0.2em] text-[#7a4a1a]">You’re buying for</p>
      <RecipientName name={payload.r} className="relative mt-3 font-display text-[clamp(2.4rem,10vw,4rem)] font-bold text-[#9c1c1c]" />
      <p className="relative mt-5 text-sm text-[#7a4a1a]">Shh… it’s a secret 🤫</p>
    </div>
  ),
  exportStyle: {
    background: ['#0f3a2a', '#0a2219'],
    frame: '#f4d27a',
    paper: '#fffaf0',
    ink: '#7a4a1a',
    accent: '#9c1c1c',
    nameFont: 'Fraunces, Georgia, serif',
    headingFont: '"Mountains of Christmas", Georgia, serif',
  },
};
