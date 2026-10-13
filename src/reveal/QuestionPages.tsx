import { useEffect, useState } from 'react';
import type { AnswerLinkPayload, QuestionLinkPayload, RevealPayload } from '../types/reveal';
import { createQuestionPacket, createReplyPacket, MAX_QUESTION_LENGTH, MAX_REPLY_LENGTH } from '../services/anonymousQuestions';
import { CopyButton } from '../components/ui/ui';
import { loadLocal, saveLocal } from '../utils/localStore';
import { getTheme } from '../themes';
import { downloadText } from '../utils/download';
import { formatDateTime } from '../utils/format';

interface LocalQuestion {
  qid: string;
  text: string;
  at: string;
  answer?: string;
}

function PacketResult({ packet, recipientLabel, filename }: { packet: string; recipientLabel: string; filename: string }) {
  return (
    <div className="mt-4 space-y-3 rounded-xl bg-pine-50 p-4">
      <p className="text-sm font-semibold">Now send this message to {recipientLabel}:</p>
      <textarea readOnly className="input h-28 font-mono text-xs" value={packet} aria-label="Encrypted message to send" onFocus={(e) => e.target.select()} />
      <div className="flex flex-wrap gap-2">
        <CopyButton text={packet} label="Copy message" className="btn-primary btn-sm" />
        <button type="button" className="btn-secondary btn-sm" onClick={() => downloadText(packet, filename)}>
          Save as file
        </button>
      </div>
      <p className="text-xs text-pine-700">It’s encrypted so only your organiser’s browser can open it. Nothing has been sent automatically — paste it into WhatsApp, email or any chat.</p>
    </div>
  );
}

/** On the reveal page: giver asks their recipient a question via the organiser. */
export function AskQuestion({ payload }: { payload: RevealPayload }) {
  const key = `ss:questions:${payload.did}:${payload.gid}`;
  const [text, setText] = useState('');
  const [packet, setPacket] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<LocalQuestion[]>(() => loadLocal(key, []));
  return (
    <section className="rounded-2xl bg-white/95 p-5 text-pine-950 shadow-xl sm:p-6">
      <h2 className="font-display text-lg font-semibold">Ask {payload.r} an anonymous question</h2>
      <p className="mt-1 text-sm text-pine-700">
        Your question goes to your organiser, who passes it on without your name. {payload.r} won’t see who asked — but your organiser will (they need to send the answer back to you).
      </p>
      <form
        className="mt-3 space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          try {
            const res = await createQuestionPacket(payload, text);
            setPacket(res.packet);
            const next = [...history, { qid: res.qid, text: text.trim(), at: new Date().toISOString() }];
            setHistory(next);
            saveLocal(key, next);
            setText('');
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not create the message.');
          }
        }}
      >
        <label className="label" htmlFor="question-text">
          Your question
        </label>
        <textarea id="question-text" className="input min-h-[90px]" maxLength={MAX_QUESTION_LENGTH} value={text} onChange={(e) => setText(e.target.value)} placeholder="What kind of books do you like?" />
        {error ? (
          <p role="alert" className="text-sm font-medium text-berry-700">
            {error}
          </p>
        ) : null}
        <button type="submit" className="btn-pine" disabled={!text.trim()}>
          Create question message
        </button>
      </form>
      {packet ? <PacketResult packet={packet} recipientLabel="your organiser" filename="secret-santa-question.txt" /> : null}
      {history.length ? (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer font-semibold">Questions you’ve asked on this device ({history.length})</summary>
          <ul className="mt-2 space-y-1">
            {history.map((q) => (
              <li key={q.qid} className="rounded-lg bg-pine-50 px-3 py-2">
                “{q.text}” <span className="text-xs text-pine-600">· {formatDateTime(q.at)}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

function SimpleShell({ themeId, children, title }: { themeId: string; children: React.ReactNode; title: string }) {
  const theme = getTheme(themeId);
  useEffect(() => {
    document.title = title;
  }, [title]);
  return (
    <div className={`reveal-root ${theme.rootClass}`}>
      {theme.Decor()}
      <main className="relative z-10 mx-auto max-w-xl px-4 pb-20 pt-12">{children}</main>
    </div>
  );
}

/** Recipient-facing page: read an anonymous question and write a reply. */
export function QuestionPage({ payload }: { payload: QuestionLinkPayload }) {
  const [text, setText] = useState('');
  const [packet, setPacket] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <SimpleShell themeId={payload.th} title={`${payload.en} · Secret Santa question`}>
      <header className="mb-6 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] opacity-80">{payload.en}</p>
        <h1 className="mt-3 font-festive text-4xl font-bold">Psst, {payload.to}!</h1>
        <p className="mt-2 opacity-90">Your Secret Santa has a question for you.</p>
      </header>
      <section className="rounded-2xl bg-white/95 p-6 text-pine-950 shadow-xl">
        <blockquote className="whitespace-pre-wrap break-words rounded-xl bg-gold-100 p-4 font-display text-lg">“{payload.text}”</blockquote>
        <form
          className="mt-5 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            try {
              setPacket(await createReplyPacket(payload, text));
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Could not create the reply.');
            }
          }}
        >
          <label className="label" htmlFor="reply-text">
            Your answer
          </label>
          <textarea id="reply-text" className="input min-h-[110px]" maxLength={MAX_REPLY_LENGTH} value={text} onChange={(e) => setText(e.target.value)} />
          {error ? (
            <p role="alert" className="text-sm font-medium text-berry-700">
              {error}
            </p>
          ) : null}
          <button type="submit" className="btn-pine" disabled={!text.trim()}>
            Create reply message
          </button>
        </form>
        {packet ? <PacketResult packet={packet} recipientLabel="the organiser (who sent you this link)" filename="secret-santa-reply.txt" /> : null}
        <p className="mt-4 text-xs text-pine-600">You don’t find out who asked — that’s the fun! Your reply goes back through the organiser.</p>
      </section>
    </SimpleShell>
  );
}

/** Giver-facing page: read the recipient's answer. */
export function AnswerPage({ payload }: { payload: AnswerLinkPayload }) {
  useEffect(() => {
    // Keep a local copy on this device
    const key = `ss:answers:${payload.qid}`;
    saveLocal(key, { q: payload.q, a: payload.a, at: payload.at });
  }, [payload]);
  return (
    <SimpleShell themeId={payload.th} title={`${payload.en} · Secret Santa answer`}>
      <header className="mb-6 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] opacity-80">{payload.en}</p>
        <h1 className="mt-3 font-festive text-4xl font-bold">You’ve got an answer!</h1>
      </header>
      <section className="space-y-4 rounded-2xl bg-white/95 p-6 text-pine-950 shadow-xl">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-pine-600">You asked</p>
          <p className="mt-1 whitespace-pre-wrap break-words">“{payload.q}”</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-pine-600">{payload.from} replied</p>
          <p className="mt-1 whitespace-pre-wrap break-words rounded-xl bg-gold-100 p-4 font-display text-lg">“{payload.a}”</p>
        </div>
      </section>
    </SimpleShell>
  );
}

