import { useState } from 'react';
import { navigate } from '../../app/router';
import { Icon } from '../../components/ui/icons';
import { Card, ConfirmDialog, SectionTitle, Toggle, useAsyncAction } from '../../components/ui/ui';
import { archiveEvent, createNextYearEvent, deleteEvent, updateEvent } from '../../services/storage';
import type { EventCtx } from './EventWorkspace';

export default function SettingsPage({ ctx }: { ctx: EventCtx }) {
  const { event } = ctx;
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [keepHistory, setKeepHistory] = useState(true);
  const { busy, run } = useAsyncAction();
  const archived = event.status === 'archived';
  return (
    <div className="space-y-6">
      <Card>
        <SectionTitle title="Privacy" />
        <div className="space-y-4">
          <Toggle
            checked={event.concealAssignments}
            onChange={(v) => void updateEvent(event.id, { concealAssignments: v })}
            label="Hide who is buying for whom on organiser screens"
            description="Handy if you're also taking part or sharing your screen. This only hides names visually — the information is still stored in this browser and you can reveal it."
          />
          <Toggle checked={event.codenamesEnabled} onChange={(v) => void updateEvent(event.id, { codenamesEnabled: v })} label="Show Secret Santa codenames on reveal pages" />
          <Toggle checked={event.includeWishlists} onChange={(v) => void updateEvent(event.id, { includeWishlists: v })} label="Include recipients' wishlists in reveal links" />
        </div>
      </Card>
      <Card>
        <SectionTitle title="Next year" description="Copies people, relationships, households, rules, theme and budget into a new exchange in the same series. This year's draw becomes history, so repeats can be avoided — it's never reused." />
        <button
          type="button"
          className="btn-pine"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const ev = await createNextYearEvent(event.id);
              navigate(`events/${ev.id}/participants`);
            })
          }
        >
          <Icon.Calendar className="h-4 w-4" /> Create {event.year + 1}’s exchange
        </button>
      </Card>
      <Card>
        <SectionTitle title={archived ? 'Archived' : 'Archive'} description="Archived exchanges are read-only and hidden from the dashboard, but their draws still count as history." />
        <button type="button" className="btn-secondary" onClick={() => void run(() => archiveEvent(event.id, !archived), archived ? 'Exchange restored' : 'Exchange archived')}>
          {archived ? 'Unarchive' : 'Archive this exchange'}
        </button>
      </Card>
      <Card className="ring-berry-200">
        <SectionTitle title="Delete exchange" description="Removes this exchange, all its draw versions, wishlists and questions from this browser. This can't be undone (unless you have a backup)." />
        <button type="button" className="btn-danger" onClick={() => setDeleteOpen(true)}>
          <Icon.Trash className="h-4 w-4" /> Delete…
        </button>
      </Card>
      <ConfirmDialog
        open={deleteOpen}
        title={`Delete ${event.name}?`}
        danger
        confirmLabel="Delete permanently"
        requireText="DELETE"
        busy={busy}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={async () => {
          await run(() => deleteEvent(event.id, keepHistory));
          setDeleteOpen(false);
          navigate('');
        }}
      >
        <p>Consider archiving instead — it keeps everything. Participant links already sent will keep working regardless.</p>
        <label className="flex items-center gap-2 font-medium">
          <input type="checkbox" className="h-5 w-5 accent-pine-700" checked={keepHistory} onChange={(e) => setKeepHistory(e.target.checked)} />
          Keep this year's assignments in the history (recommended)
        </label>
      </ConfirmDialog>
    </div>
  );
}
