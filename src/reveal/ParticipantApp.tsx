import { useEffect, useState } from 'react';
import '@fontsource-variable/inter';
import '@fontsource/fraunces/700.css';
import '@fontsource/great-vibes';
import '@fontsource/mountains-of-christmas/400.css';
import '@fontsource/mountains-of-christmas/700.css';
import '@fontsource/cormorant-garamond/500.css';
import '@fontsource/cormorant-garamond/600.css';
import '@fontsource/cormorant-garamond/500-italic.css';
import './reveal.css';
import { LinkError, openAnswerLink, openQuestionLink, openRevealLink, openWishlistRequestLink, parseFragment } from '../services/revealLinks';
import type { AnswerLinkPayload, QuestionLinkPayload, RevealPayload, WishlistRequestPayload } from '../types/reveal';
import RevealPage from './RevealPage';
import { AnswerPage, QuestionPage } from './QuestionPages';
import WishlistFormPage from './WishlistFormPage';
import { Snow } from '../themes/shared';

type Loaded =
  | { kind: 'r'; payload: RevealPayload }
  | { kind: 'q'; payload: QuestionLinkPayload }
  | { kind: 'a'; payload: AnswerLinkPayload }
  | { kind: 'w'; payload: WishlistRequestPayload };

export function LinkErrorScreen({ message }: { message: string }) {
  return (
    <div className="reveal-root theme-classic flex items-center justify-center px-4">
      <Snow count={25} />
      <div className="relative z-10 max-w-md rounded-2xl bg-white/95 p-8 text-center text-pine-950 shadow-2xl" role="alert">
        <p className="text-4xl" aria-hidden>
          🧦
        </p>
        <h1 className="mt-3 font-festive text-3xl font-bold text-berry-700">Oh, tinsel!</h1>
        <p className="mt-3 text-sm leading-relaxed text-pine-800">{message}</p>
        <p className="mt-4 text-xs text-pine-600">Tip: some chat apps cut long links in half. Ask your organiser to send it again, or to send the QR code.</p>
      </div>
    </div>
  );
}

export default function ParticipantApp() {
  const [state, setState] = useState<{ loading: true } | { loading: false; error: string } | { loading: false; data: Loaded }>({ loading: true });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setState({ loading: true });
      try {
        const f = parseFragment(window.location.hash);
        if (!f) throw new LinkError('missing', 'This link is missing its secret part.');
        let data: Loaded;
        if (f.kind === 'r') data = { kind: 'r', payload: await openRevealLink(f) };
        else if (f.kind === 'q') data = { kind: 'q', payload: await openQuestionLink(f) };
        else if (f.kind === 'a') data = { kind: 'a', payload: await openAnswerLink(f) };
        else data = { kind: 'w', payload: await openWishlistRequestLink(f) };
        if (!cancelled) setState({ loading: false, data });
      } catch (e) {
        // Never log the link or key — only a generic message.
        if (!cancelled) setState({ loading: false, error: e instanceof LinkError ? e.message : 'This link could not be opened.' });
      }
    };
    void load();
    window.addEventListener('hashchange', load);
    return () => {
      cancelled = true;
      window.removeEventListener('hashchange', load);
    };
  }, []);

  if (state.loading) {
    return (
      <div className="reveal-root theme-elegant flex items-center justify-center" role="status" aria-live="polite">
        <span className="animate-pulse font-elegant text-xl text-gold-200">Unwrapping your link…</span>
      </div>
    );
  }
  if ('error' in state) return <LinkErrorScreen message={state.error} />;
  const { data } = state;
  switch (data.kind) {
    case 'r':
      return <RevealPage payload={data.payload} />;
    case 'q':
      return <QuestionPage payload={data.payload} />;
    case 'a':
      return <AnswerPage payload={data.payload} />;
    case 'w':
      return <WishlistFormPage payload={data.payload} />;
  }
}
