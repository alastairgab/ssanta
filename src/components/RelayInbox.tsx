import { useState } from 'react';
import { importRelayMessage, type RelayImportResult } from '../services/eventOps';
import { Card, SectionTitle, TextArea, useAsyncAction } from './ui/ui';
import { Icon } from './ui/icons';

/** Paste box for encrypted messages sent back by participants (questions, replies, wishlists). */
export function RelayInbox({ eventId, onImported }: { eventId: string; onImported?: (r: RelayImportResult) => void }) {
  const [text, setText] = useState('');
  const { busy, run } = useAsyncAction();
  return (
    <Card>
      <SectionTitle
        title="Inbox: paste a participant message"
        description="When someone sends you a Secret Santa message (a question, a reply or a wishlist), paste the whole message here. It’s decrypted with this exchange’s private key, which only exists in your browser."
      />
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await run(() => importRelayMessage(eventId, text));
          if (r) {
            setText('');
            onImported?.(r);
          }
        }}
        className="space-y-3"
      >
        <TextArea label="Message" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="SECRET-SANTA-PACKET:1:…" />
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="btn-pine" disabled={!text.trim() || busy}>
            <Icon.Upload className="h-4 w-4" /> {busy ? 'Opening…' : 'Import message'}
          </button>
          <label className="btn-secondary cursor-pointer">
            Load from file
            <input
              type="file"
              accept=".txt,text/plain"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f && f.size < 1_000_000) setText(await f.text());
              }}
            />
          </label>
        </div>
      </form>
    </Card>
  );
}
