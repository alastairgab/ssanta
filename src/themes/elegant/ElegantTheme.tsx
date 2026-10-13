import { RecipientName, Snow, type ThemeModule } from '../shared';

function Ornament({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 60 80" className={className} aria-hidden>
      <defs>
        <linearGradient id="og" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#f6e3a8" />
          <stop offset=".5" stopColor="#c49a3c" />
          <stop offset="1" stopColor="#8a6420" />
        </linearGradient>
      </defs>
      <path d="M30 2v10" stroke="#e3c477" strokeWidth="1.5" />
      <rect x="24" y="12" width="12" height="7" rx="1.5" fill="url(#og)" />
      <circle cx="30" cy="48" r="28" fill="none" stroke="url(#og)" strokeWidth="1.5" />
      <path d="M2 48h56M30 20c-14 14-14 42 0 56M30 20c14 14 14 42 0 56" stroke="url(#og)" strokeWidth="1" fill="none" />
    </svg>
  );
}

export const elegantTheme: ThemeModule = {
  id: 'elegant',
  rootClass: 'theme-elegant',
  Decor: () => <Snow count={18} />,
  Sealed: ({ onOpen, disabled, label }) => (
    <button type="button" className="reveal-object" onClick={onOpen} disabled={disabled} aria-label={label} data-testid="reveal-trigger">
      <div className="elegant-invite">
        <div className="half" />
        <div className="cover">
          <Ornament className="h-20 w-16" />
          <span className="gold-text font-elegant text-3xl font-semibold italic">Secret Santa</span>
          <span className="font-elegant text-xs uppercase tracking-[0.35em] text-[#e3c477]">Open with care</span>
        </div>
      </div>
    </button>
  ),
  Card: ({ payload }) => (
    <div className="elegant-card mx-auto w-full max-w-lg px-8 py-12 text-center sm:px-12">
      <Ornament className="mx-auto h-14 w-12" />
      <p className="mt-3 font-elegant text-xs uppercase tracking-[0.35em] text-[#8a6420]">The honour of your gift goes to</p>
      <RecipientName name={payload.r} className="mt-4 font-elegant text-[clamp(2.4rem,10vw,4rem)] font-semibold text-[#14382c]" />
      <div className="mx-auto my-5 h-px w-32 bg-gradient-to-r from-transparent via-[#c49a3c] to-transparent" />
      <p className="font-elegant text-base italic text-[#3a5a4c]">With warmest wishes for a joyous season</p>
    </div>
  ),
  exportStyle: {
    background: ['#12352a', '#08201a'],
    frame: '#c49a3c',
    paper: '#fdf9ee',
    ink: '#3a5a4c',
    accent: '#14382c',
    nameFont: '"Cormorant Garamond", Georgia, serif',
    headingFont: '"Cormorant Garamond", Georgia, serif',
  },
};
