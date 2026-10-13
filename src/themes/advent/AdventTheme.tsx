import { RecipientName, Snow, type ThemeModule } from '../shared';

const DOOR_COLOURS = ['#f1d49a', '#e9c27e', '#f5dfb0', '#e6b871', '#f0cc8c'];
// Shuffled-looking but fixed order of numbers, like a real advent calendar.
const NUMBERS = [7, 18, 3, 22, 11, 15, 1, 20, 9, 13, 5, 17, 24, 2, 19, 8, 12, 4, 21, 14, 6, 10, 16, 23];

function Village() {
  return (
    <svg className="village" viewBox="0 0 1200 300" preserveAspectRatio="xMidYMax slice" aria-hidden>
      <path d="M0 230 Q300 190 600 225 T1200 215 V300 H0Z" fill="#eaf2fb" />
      <g fill="#14233f">
        <path d="M60 230v-70l45-40 45 40v70z" />
        <path d="M190 230v-95l30-30 30 30v95z" />
        <path d="M300 230v-60l55-45 55 45v60z" />
        <path d="M470 230v-110l18-60 18 60v110z" />
        <path d="M560 230v-70l50-40 50 40v70z" />
        <path d="M720 230v-80l40-40 40 40v80z" />
        <path d="M860 230v-60l60-45 60 45v60z" />
        <path d="M1030 230v-90l35-35 35 35v90z" />
      </g>
      <g fill="#ffd27a">
        <rect x="85" y="185" width="14" height="16" />
        <rect x="112" y="185" width="14" height="16" />
        <rect x="212" y="150" width="14" height="18" />
        <rect x="335" y="190" width="16" height="14" />
        <rect x="365" y="190" width="16" height="14" />
        <rect x="481" y="140" width="14" height="22" />
        <rect x="590" y="180" width="14" height="16" />
        <rect x="620" y="180" width="14" height="16" />
        <rect x="750" y="170" width="18" height="18" />
        <rect x="900" y="190" width="16" height="14" />
        <rect x="935" y="190" width="16" height="14" />
        <rect x="1056" y="160" width="16" height="18" />
      </g>
      <g fill="#fff">
        <path d="M60 160l45-40 45 40-8 4-37-32-37 32z" />
        <path d="M300 170l55-45 55 45-8 4-47-38-47 38z" />
        <path d="M560 160l50-40 50 40-8 4-42-34-42 34z" />
        <path d="M860 170l60-45 60 45-8 4-52-38-52 38z" />
      </g>
    </svg>
  );
}

export const adventTheme: ThemeModule = {
  id: 'advent',
  rootClass: 'theme-advent',
  Decor: () => (
    <>
      <Snow count={50} />
      <Village />
    </>
  ),
  Sealed: ({ onOpen, disabled, label }) => (
    <div className="advent-board">
      <p className="mb-3 text-center font-festive text-2xl font-bold text-[#f3d9a4]">Open door 24</p>
      <div className="advent-grid">
        {NUMBERS.map((n, i) =>
          n === 24 ? (
            <button
              key={n}
              type="button"
              className="reveal-object advent-door is-target"
              onClick={onOpen}
              disabled={disabled}
              aria-label={label}
              data-testid="reveal-trigger"
            >
              <span className="door-inside" />
              <span className="door-face">24</span>
            </button>
          ) : (
            <div key={n} className="advent-door" aria-hidden>
              <span className="door-face" style={{ '--door': DOOR_COLOURS[i % DOOR_COLOURS.length] } as React.CSSProperties}>
                {n}
              </span>
            </div>
          ),
        )}
      </div>
    </div>
  ),
  Card: ({ payload }) => (
    <div className="advent-card mx-auto w-full max-w-lg px-6 py-10 text-center sm:px-10">
      <p className="font-festive text-2xl font-bold text-[#7b2d1d]">Behind door 24…</p>
      <p className="mt-4 text-sm font-semibold uppercase tracking-[0.2em] text-[#8a6a3a]">your gift goes to</p>
      <RecipientName name={payload.r} className="mt-3 font-festive text-[clamp(2.6rem,11vw,4.4rem)] font-bold text-[#1c2f52]" />
      <p className="mt-5 text-sm text-[#8a6a3a]">Happy gifting — and keep it hush-hush! ❄️</p>
    </div>
  ),
  exportStyle: {
    background: ['#1c2f52', '#0d1730'],
    frame: '#e8b04a',
    paper: '#fdf7ea',
    ink: '#8a6a3a',
    accent: '#1c2f52',
    nameFont: '"Mountains of Christmas", Georgia, serif',
    headingFont: '"Mountains of Christmas", Georgia, serif',
  },
};
