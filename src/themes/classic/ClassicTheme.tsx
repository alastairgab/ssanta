import { Holly, RecipientName, Snow, type ThemeModule } from '../shared';

export const classicTheme: ThemeModule = {
  id: 'classic',
  rootClass: 'theme-classic',
  Decor: () => <Snow count={45} />,
  Sealed: ({ onOpen, disabled, label }) => (
    <button type="button" className="reveal-object" onClick={onOpen} disabled={disabled} aria-label={label} data-testid="reveal-trigger">
      <div className="envelope">
        <div className="env-back" />
        <div className="env-letter" />
        <div className="env-front" />
        <div className="env-flap" />
        <div className="env-seal">
          <Holly className="h-8 w-10" />
        </div>
      </div>
    </button>
  ),
  Card: ({ payload }) => (
    <div className="classic-letter mx-auto w-full max-w-lg">
      <div className="inner text-center">
        <Holly className="mx-auto mb-1 h-10 w-16" />
        <p className="font-festive text-xl font-bold text-[#8f1d1d] sm:text-2xl">Your Secret Santa Mission</p>
        <p className="mt-5 font-elegant text-lg italic text-[#5a3b22]">This Christmas, you are buying a gift for</p>
        <RecipientName name={payload.r} className="mt-3 font-script text-[clamp(2.6rem,11vw,4.5rem)] text-[#a51f1f]" />
        <div className="mx-auto my-5 h-px w-40 bg-gradient-to-r from-transparent via-[#c8962e] to-transparent" />
        <p className="font-elegant text-base text-[#5a3b22]">Keep it secret, keep it merry!</p>
      </div>
    </div>
  ),
  exportStyle: {
    background: ['#a32323', '#6f1515'],
    frame: 'candycane',
    paper: '#fbf5e6',
    ink: '#5a3b22',
    accent: '#a51f1f',
    nameFont: '"Great Vibes", "Segoe Script", cursive',
    headingFont: '"Mountains of Christmas", Georgia, serif',
  },
};
