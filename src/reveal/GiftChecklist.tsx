import { useState } from 'react';
import { loadLocal, saveLocal } from '../utils/localStore';

const ITEMS = [
  { id: 'idea', label: 'Gift idea chosen' },
  { id: 'bought', label: 'Gift purchased' },
  { id: 'wrapped', label: 'Gift wrapped' },
  { id: 'ready', label: 'Ready for the exchange' },
] as const;

/** Private, device-local checklist. Never sent anywhere — the organiser can't see it. */
export function GiftChecklist({ storageKey }: { storageKey: string }) {
  const [done, setDone] = useState<Record<string, boolean>>(() => loadLocal(storageKey, {}));
  const [persisted, setPersisted] = useState(true);
  const count = ITEMS.filter((i) => done[i.id]).length;
  return (
    <section className="rounded-2xl bg-white/95 p-5 text-pine-950 shadow-xl sm:p-6">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-display text-lg font-semibold">My gift checklist</h2>
        <span className="text-sm font-semibold text-pine-600" aria-live="polite">
          {count}/{ITEMS.length}
        </span>
      </div>
      <ul className="space-y-1">
        {ITEMS.map((i) => (
          <li key={i.id}>
            <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-pine-50">
              <input
                type="checkbox"
                className="h-5 w-5 accent-berry-600"
                checked={Boolean(done[i.id])}
                onChange={(e) => {
                  const next = { ...done, [i.id]: e.target.checked };
                  setDone(next);
                  setPersisted(saveLocal(storageKey, next));
                }}
              />
              <span className={done[i.id] ? 'text-pine-500 line-through' : ''}>{i.label}</span>
            </label>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-pine-600">
        {persisted ? 'Saved only on this device and browser. Your organiser can’t see it.' : 'This browser isn’t allowing storage, so ticks won’t be remembered.'}
      </p>
    </section>
  );
}
