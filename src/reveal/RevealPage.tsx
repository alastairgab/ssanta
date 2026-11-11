import { useEffect, useRef, useState } from 'react';
import { giverStorageKey, type RevealPayload } from '../types/reveal';
import { getTheme } from '../themes';
import { formatDate, formatMoney } from '../utils/format';
import { renderCardImage } from './cardExport';
import { downloadBlob, safeFilename } from '../utils/download';
import { safeExternalUrl } from '../services/wishlist';
import { GiftChecklist } from './GiftChecklist';
import { AskQuestion } from './QuestionPages';

type Phase = 'sealed' | 'opening' | 'revealed';
const OPEN_MS = 1900;

export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  } catch {
    return false;
  }
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white/95 p-5 text-pine-950 shadow-xl backdrop-blur sm:p-6">
      <h2 className="mb-3 font-display text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function WishlistView({ wl, recipient }: { wl: NonNullable<RevealPayload['wl']>; recipient: string }) {
  const rows: [string, string | undefined][] = [
    ['Interests', wl.interests],
    ['Hobbies', wl.hobbies],
    ['Favourite shops', wl.retailers],
    ['Gift ideas', wl.suggestions],
    ['Please avoid', wl.avoid],
    ['Sizes', wl.sizes],
    ['Notes', wl.notes],
  ];
  const links = (wl.links ?? []).map((l) => safeExternalUrl(l)).filter((l): l is string => Boolean(l));
  return (
    <Panel title={`${recipient}’s wishlist`}>
      <dl className="space-y-3 text-sm">
        {rows
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k}>
              <dt className="font-semibold text-pine-700">{k}</dt>
              <dd className="whitespace-pre-wrap break-words">{v}</dd>
            </div>
          ))}
        {links.length ? (
          <div>
            <dt className="font-semibold text-pine-700">Links</dt>
            <dd>
              <ul className="list-disc pl-5">
                {links.map((l) => (
                  <li key={l} className="break-all">
                    <a href={l} target="_blank" rel="noopener noreferrer nofollow" className="text-berry-700 underline">
                      {new URL(l).hostname}
                    </a>
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        ) : null}
      </dl>
    </Panel>
  );
}

export default function RevealPage({ payload }: { payload: RevealPayload }) {
  const theme = getTheme(payload.th);
  const [phase, setPhase] = useState<Phase>('sealed');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    // The title never contains the recipient's name (tabs and history can be visible to others).
    document.title = `${payload.en} · Secret Santa`;
    return () => window.clearTimeout(timer.current);
  }, [payload.en]);

  const open = () => {
    if (phase !== 'sealed') return;
    if (prefersReducedMotion()) {
      setPhase('revealed');
      return;
    }
    setPhase('opening');
    timer.current = window.setTimeout(() => setPhase('revealed'), OPEN_MS);
  };

  useEffect(() => {
    if (phase === 'revealed') cardRef.current?.focus();
  }, [phase]);

  const greetingName = payload.gc || payload.g;
  const details: [string, string][] = [];
  if (payload.date) details.push(['When', formatDate(payload.date)]);
  if (payload.bud !== undefined) details.push(['Budget', formatMoney(payload.bud, payload.cur ?? 'AUD')]);
  if (payload.loc) details.push(['Where', payload.loc]);

  return (
    <div className={`reveal-root ${theme.rootClass} phase-${phase}`} data-theme={theme.id}>
      {theme.Decor()}
      <main className="relative z-10 mx-auto flex max-w-2xl flex-col gap-6 px-4 pb-24 pt-10 sm:pt-14">
        <header className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] opacity-80">{payload.en}</p>
          {payload.gc ? (
            <>
              <h1 className="mt-3 font-festive text-4xl font-bold leading-tight sm:text-5xl">Welcome back, {payload.gc}.</h1>
              <p className="mt-2 text-lg opacity-90">
                (That’s you, {payload.g}.) Your Christmas mission is ready.
              </p>
            </>
          ) : (
            <>
              <h1 className="mt-3 font-festive text-4xl font-bold leading-tight sm:text-5xl">Hi {payload.g}!</h1>
              <p className="mt-2 text-lg opacity-90">Your Christmas mission is ready.</p>
            </>
          )}
          {payload.greet ? <p className="mx-auto mt-4 max-w-md whitespace-pre-wrap break-words italic opacity-90">“{payload.greet}”</p> : null}
        </header>

        <div aria-live="polite" className="sr-only">
          {phase === 'revealed' ? `You are buying a gift for ${payload.r}.` : phase === 'opening' ? 'Opening…' : ''}
        </div>

        {phase !== 'revealed' ? (
          <div className="stage">
            <div className="flex flex-col items-center gap-6">
              {theme.Sealed({ onOpen: open, disabled: phase !== 'sealed', label: `Open to reveal who ${greetingName} is buying for` })}
              {phase === 'sealed' ? (
                <p className="reveal-hint rounded-full bg-black/25 px-4 py-2 text-sm font-semibold backdrop-blur">Tap to open · or press Enter</p>
              ) : null}
            </div>
          </div>
        ) : (
          <div ref={cardRef} tabIndex={-1} className="fade-up outline-none" data-testid="revealed-card">
            {theme.Card({ payload })}
          </div>
        )}

        {phase === 'revealed' ? (
          <div className="fade-up space-y-6" style={{ animationDelay: '0.25s' }}>
            <div className="flex flex-wrap justify-center gap-3">
              <button type="button" className="btn bg-white/90 text-pine-950 hover:bg-white" onClick={() => setPhase('sealed')}>
                ↺ Watch the reveal again
              </button>
              <button
                type="button"
                className="btn bg-white/90 text-pine-950 hover:bg-white"
                disabled={exporting}
                onClick={async () => {
                  setExporting(true);
                  setExportError(null);
                  try {
                    downloadBlob(await renderCardImage(payload, theme), `secret-santa-${safeFilename(payload.en)}.png`);
                  } catch (e) {
                    setExportError(e instanceof Error ? e.message : 'Could not save the image.');
                  } finally {
                    setExporting(false);
                  }
                }}
              >
                ⤓ {exporting ? 'Saving…' : 'Save card as image'}
              </button>
            </div>
            {exportError ? <p className="text-center text-sm" role="alert">{exportError}</p> : null}
            <p className="text-center text-xs opacity-80">The image shows your recipient’s name — be careful who you share it with!</p>

            {details.length || payload.ins || payload.desc ? (
              <Panel title="Exchange details">
                {payload.desc ? <p className="mb-3 whitespace-pre-wrap break-words text-sm">{payload.desc}</p> : null}
                {details.length ? (
                  <dl className="grid gap-3 text-sm sm:grid-cols-3">
                    {details.map(([k, v]) => (
                      <div key={k} className="rounded-xl bg-pine-50 p-3">
                        <dt className="text-xs font-semibold uppercase tracking-wide text-pine-600">{k}</dt>
                        <dd className="mt-0.5 break-words font-semibold">{v}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
                {payload.ins ? <p className="mt-3 whitespace-pre-wrap break-words text-sm">{payload.ins}</p> : null}
              </Panel>
            ) : null}

            {payload.wl ? <WishlistView wl={payload.wl} recipient={payload.r} /> : null}
            {payload.rk ? <AskQuestion payload={payload} /> : null}
            <GiftChecklist storageKey={`ss:check:${giverStorageKey(payload)}`} />

            <footer className="space-y-1 text-center text-xs opacity-80">
              <p>
                {payload.en} — Draw Version {payload.dv} · Link #{payload.iss}
              </p>
              <p>This page shows the draw your link was created for. If your organiser sends you a newer link, use that one instead.</p>
              <p>Anyone with this link can see your assignment. Keep it to yourself!</p>
            </footer>
          </div>
        ) : null}
      </main>
    </div>
  );
}
