import { REVEAL_THEMES, type ThemeId } from '../../types/models';
import { Icon } from '../ui/icons';

const PREVIEW: Record<ThemeId, { bg: string; accent: string; glyph: string }> = {
  classic: { bg: 'bg-[repeating-linear-gradient(45deg,#cd2f2f_0_8px,#fbfaf6_8px_16px,#1e553e_16px_24px,#fbfaf6_24px_32px)]', accent: 'bg-[#f5ecd7]', glyph: '✉️' },
  present: { bg: 'bg-gradient-to-br from-berry-700 to-berry-900', accent: 'bg-gold-300', glyph: '🎁' },
  advent: { bg: 'bg-gradient-to-b from-[#16213e] to-[#2d4a6b]', accent: 'bg-[#f3d9a4]', glyph: '🏘️' },
  elegant: { bg: 'bg-gradient-to-br from-pine-900 to-pine-950', accent: 'bg-gold-300', glyph: '✨' },
};

export function ThemePicker({ value, onChange }: { value: ThemeId; onChange: (t: ThemeId) => void }) {
  return (
    <fieldset>
      <legend className="label">Reveal theme</legend>
      <p className="hint mb-2">What participants see when they open their link.</p>
      <div className="grid gap-3 sm:grid-cols-2" role="radiogroup">
        {REVEAL_THEMES.map((t) => {
          const p = PREVIEW[t.id];
          const selected = value === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(t.id)}
              className={`flex items-stretch gap-3 rounded-xl bg-white p-2 text-left ring-2 transition ${selected ? 'ring-berry-600' : 'ring-pine-100 hover:ring-pine-300'}`}
            >
              <span className={`relative flex h-20 w-20 shrink-0 items-center justify-center rounded-lg ${p.bg}`} aria-hidden>
                <span className={`flex h-10 w-12 items-center justify-center rounded ${p.accent} text-xl shadow`}>{p.glyph}</span>
              </span>
              <span className="min-w-0 py-1">
                <span className="flex items-center gap-1 font-semibold">
                  {t.name}
                  {selected ? <Icon.Check className="h-4 w-4 text-berry-600" /> : null}
                </span>
                <span className="mt-0.5 block text-xs text-pine-700">{t.description}</span>
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
