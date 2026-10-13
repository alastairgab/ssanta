import { useEffect, useState } from 'react';
import type { PublicWishlist } from '../types/models';
import type { WishlistRequestPayload } from '../types/reveal';
import { createWishlistSubmission } from '../services/wishlist';
import { getTheme } from '../themes';
import { CopyButton } from '../components/ui/ui';
import { downloadText } from '../utils/download';

const FIELDS: { key: keyof PublicWishlist; label: string; placeholder: string; long?: boolean }[] = [
  { key: 'interests', label: 'Things I’m into', placeholder: 'Gardening, sci-fi, coffee…' },
  { key: 'hobbies', label: 'Hobbies', placeholder: 'Running, board games' },
  { key: 'retailers', label: 'Shops I like', placeholder: 'Local bookshop, Bunnings' },
  { key: 'suggestions', label: 'Gift ideas', placeholder: 'A nice notebook, hot sauce…', long: true },
  { key: 'avoid', label: 'Please avoid', placeholder: 'Candles, chocolate (allergy)' },
  { key: 'sizes', label: 'Sizes (optional)', placeholder: 'T-shirt M, socks 8–11' },
  { key: 'notes', label: 'Anything else', placeholder: '', long: true },
];

/** Participant-facing wishlist form (Workflow B). Produces an encrypted message for the organiser. */
export default function WishlistFormPage({ payload }: { payload: WishlistRequestPayload }) {
  const theme = getTheme(payload.th);
  const [w, setW] = useState<PublicWishlist>({ links: [] });
  const [links, setLinks] = useState('');
  const [packet, setPacket] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    document.title = `${payload.en} · Wishlist`;
  }, [payload.en]);
  return (
    <div className={`reveal-root ${theme.rootClass}`}>
      {theme.Decor()}
      <main className="relative z-10 mx-auto max-w-xl px-4 pb-20 pt-12">
        <header className="mb-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] opacity-80">{payload.en}</p>
          <h1 className="mt-3 font-festive text-4xl font-bold">Hi {payload.name}!</h1>
          <p className="mt-2 opacity-90">Tell your Secret Santa what you’d love. Everything is optional — no personal details needed.</p>
        </header>
        <form
          className="space-y-4 rounded-2xl bg-white/95 p-6 text-pine-950 shadow-xl"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            try {
              setPacket(await createWishlistSubmission(payload, { ...w, links: links.split(/\s+/).filter(Boolean) }));
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Could not create the message.');
            }
          }}
        >
          {FIELDS.map((f) => (
            <div key={f.key}>
              <label className="label" htmlFor={`wl-${f.key}`}>
                {f.label}
              </label>
              {f.long ? (
                <textarea id={`wl-${f.key}`} className="input mt-1.5 min-h-[80px]" maxLength={2000} placeholder={f.placeholder} value={(w[f.key] as string) ?? ''} onChange={(e) => setW({ ...w, [f.key]: e.target.value })} />
              ) : (
                <input id={`wl-${f.key}`} className="input mt-1.5" maxLength={1000} placeholder={f.placeholder} value={(w[f.key] as string) ?? ''} onChange={(e) => setW({ ...w, [f.key]: e.target.value })} />
              )}
            </div>
          ))}
          <div>
            <label className="label" htmlFor="wl-links">
              Product links (one per line)
            </label>
            <textarea id="wl-links" className="input mt-1.5 min-h-[70px]" value={links} onChange={(e) => setLinks(e.target.value)} placeholder="https://…" />
          </div>
          {error ? (
            <p role="alert" className="text-sm font-medium text-berry-700">
              {error}
            </p>
          ) : null}
          <button type="submit" className="btn-primary w-full">
            Create my wishlist message
          </button>
          {packet ? (
            <div className="space-y-3 rounded-xl bg-pine-50 p-4">
              <p className="text-sm font-semibold">Now send this message to your organiser:</p>
              <textarea readOnly className="input h-28 font-mono text-xs" value={packet} aria-label="Encrypted wishlist message" onFocus={(e) => e.target.select()} />
              <div className="flex flex-wrap gap-2">
                <CopyButton text={packet} label="Copy message" className="btn-primary btn-sm" />
                <button type="button" className="btn-secondary btn-sm" onClick={() => downloadText(packet, 'secret-santa-wishlist.txt')}>
                  Save as file
                </button>
              </div>
              <p className="text-xs text-pine-700">Only your organiser’s browser can open it. Your Secret Santa will see your wishlist once the organiser updates their link.</p>
            </div>
          ) : null}
        </form>
      </main>
    </div>
  );
}
