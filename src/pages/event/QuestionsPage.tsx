import { Icon } from '../../components/ui/icons';
import { Badge, Callout, Card, CopyButton, EmptyState, SectionTitle, useAsyncAction } from '../../components/ui/ui';
import { RelayInbox } from '../../components/RelayInbox';
import { useQuestions, useReplies } from '../../hooks/useData';
import { buildGiverAnswerLink, buildRecipientQuestionLink } from '../../services/anonymousQuestions';
import { db } from '../../services/storage';
import { linkNeedsRecreating } from '../../services/revealLinks';
import { formatDateTime } from '../../utils/format';
import type { EventCtx } from './EventWorkspace';

export default function QuestionsPage({ ctx }: { ctx: EventCtx }) {
  const { event, nameOf } = ctx;
  const questions = (useQuestions(event.id) ?? []).sort((a, b) => b.importedAt.localeCompare(a.importedAt));
  const replies = useReplies() ?? [];
  const { busy, run } = useAsyncAction();

  return (
    <div className="space-y-6">
      <Callout title="How anonymous questions work">
        <ol className="list-decimal space-y-1 pl-5">
          <li>A giver taps “Ask an anonymous question” on their reveal page and sends you the encrypted message it creates.</li>
          <li>You paste it below, then forward the recipient their question link. It shows only the question — never who asked.</li>
          <li>The recipient replies and sends you their encrypted reply. Paste it below and forward the answer link to the giver.</li>
        </ol>
        <p className="mt-2">
          Questions are anonymous to the <strong>recipient</strong>, not to you: as organiser you can see who asked so you can route the answer. Your chat app will also show who sent each message to you.
        </p>
      </Callout>

      <RelayInbox eventId={event.id} />

      <Card>
        <SectionTitle title={`Questions (${questions.length})`} />
        {questions.length === 0 ? (
          <EmptyState title="No questions yet" icon={<Icon.Message />}>
            Imported questions and replies will appear here.
          </EmptyState>
        ) : (
          <ul className="space-y-4">
            {questions.map((q) => {
              const qReplies = replies.filter((r) => r.questionId === q.id);
              return (
                <li key={q.id} className="rounded-xl p-4 ring-1 ring-pine-200">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-pine-700">
                    <Badge tone={q.status === 'returned' ? 'green' : q.status === 'answered' ? 'blue' : q.status === 'forwarded' ? 'gold' : 'neutral'}>{q.status}</Badge>
                    From <strong>{nameOf(q.giverId)}</strong> (hidden from recipient) about <strong>{nameOf(q.recipientId)}</strong> · asked {formatDateTime(q.askedAt)}
                  </div>
                  <p className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-pine-50 p-3 text-sm">“{q.text}”</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {q.recipientLink && !linkNeedsRecreating(q.recipientLink) ? (
                      <CopyButton
                        text={`Hi ${nameOf(q.recipientId)}! Your Secret Santa has an anonymous question for you. Open this link to read it and reply:\n${q.recipientLink}`}
                        label="Copy message for recipient"
                      />
                    ) : (
                      <button
                        type="button"
                        className="btn-pine btn-sm"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            const name = ctx.draws.find((d) => d.id === q.drawId)?.snapshot.participants.find((p) => p.id === q.recipientId)?.displayName ?? nameOf(q.recipientId);
                            const link = await buildRecipientQuestionLink(event, q, name);
                            await db.questions.update(q.id, { recipientLink: link });
                          })
                        }
                      >
                        <Icon.Link className="h-4 w-4" /> Create link for {nameOf(q.recipientId)}
                      </button>
                    )}
                    {q.recipientLink && q.status === 'received' ? (
                      <button type="button" className="btn-ghost btn-sm" onClick={() => void db.questions.update(q.id, { forwardedToRecipient: true, status: 'forwarded' })}>
                        Mark as forwarded
                      </button>
                    ) : null}
                  </div>
                  {qReplies.map((r) => (
                    <div key={r.id} className="mt-3 rounded-lg bg-gold-100 p-3 text-sm">
                      <p className="text-xs text-pine-700">Reply from {nameOf(q.recipientId)} · {formatDateTime(r.repliedAt)}</p>
                      <p className="mt-1 whitespace-pre-wrap break-words">“{r.text}”</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {r.giverLink && !linkNeedsRecreating(r.giverLink) ? (
                          <CopyButton text={`Your Secret Santa recipient answered your question! Open this to read it:\n${r.giverLink}`} label={`Copy message for ${nameOf(q.giverId)}`} />
                        ) : (
                          <button
                            type="button"
                            className="btn-pine btn-sm"
                            disabled={busy}
                            onClick={() =>
                              void run(async () => {
                                const link = await buildGiverAnswerLink(event, q, r, nameOf(q.recipientId));
                                await db.replies.update(r.id, { giverLink: link });
                              })
                            }
                          >
                            <Icon.Link className="h-4 w-4" /> Create answer link for {nameOf(q.giverId)}
                          </button>
                        )}
                        {r.giverLink && !r.returnedToGiver ? (
                          <button
                            type="button"
                            className="btn-ghost btn-sm"
                            onClick={async () => {
                              await db.replies.update(r.id, { returnedToGiver: true });
                              await db.questions.update(q.id, { status: 'returned' });
                            }}
                          >
                            Mark as sent to giver
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
