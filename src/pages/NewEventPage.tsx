import { useState } from 'react';
import { navigate } from '../app/router';
import { Card, PageHeader, Select, TextInput } from '../components/ui/ui';
import { EventDetailsForm, toEventPatch, valuesFromEvent } from '../components/dashboard/EventDetailsForm';
import { useEvents, useSeriesList } from '../hooks/useData';
import { createEvent, createNextYearEvent, createSeries, updateEvent } from '../services/storage';

export default function NewEventPage({ seriesId }: { seriesId?: string }) {
  const series = useSeriesList();
  const events = useEvents();
  const [choice, setChoice] = useState<string>(seriesId ?? '__new');
  const [newSeriesName, setNewSeriesName] = useState('Family Christmas');
  const [seriesError, setSeriesError] = useState<string | null>(null);

  if (!series || !events) return null;
  const effectiveChoice = choice;
  const latestInSeries = events.filter((e) => e.seriesId === effectiveChoice).sort((a, b) => b.year - a.year)[0];

  const initial = valuesFromEvent();
  if (effectiveChoice === '__new') initial.name = `${newSeriesName || 'Secret Santa'} ${initial.year}`;
  else {
    const s = series.find((x) => x.id === effectiveChoice);
    if (s) initial.name = `${s.name} ${initial.year}`;
  }

  return (
    <>
      <PageHeader title="Create an exchange" subtitle="Step 1 of 6 — the basics. You can change all of this later." />
      {latestInSeries ? (
        <Card className="mb-6">
          <h2 className="font-semibold">Running {series.find((s) => s.id === effectiveChoice)?.name} again?</h2>
          <p className="mt-1 text-sm text-pine-700">
            Start from {latestInSeries.name}: we’ll copy the people, relationships, households, rules, theme and budget. Previous draws are kept as history (so repeats can be avoided) — they are never reused.
          </p>
          <button
            type="button"
            className="btn-pine mt-3"
            onClick={async () => {
              const ev = await createNextYearEvent(latestInSeries.id);
              navigate(`events/${ev.id}/participants`);
            }}
          >
            Create {latestInSeries.year + 1} from {latestInSeries.year}
          </button>
        </Card>
      ) : null}
      <Card>
        <EventDetailsForm
          key={effectiveChoice}
          initial={initial}
          submitLabel="Create & add participants"
          extraTop={
            <div className="grid gap-4 sm:grid-cols-2">
              <Select label="Exchange series" value={effectiveChoice} onChange={(e) => setChoice(e.target.value)} hint="A series groups the same exchange across years (e.g. Family Christmas 2025, 2026…). History only carries over within the series you choose.">
                <option value="__new">+ New series…</option>
                {series.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
              {effectiveChoice === '__new' ? <TextInput label="New series name" value={newSeriesName} onChange={(e) => setNewSeriesName(e.target.value)} error={seriesError} placeholder="Office Secret Santa" /> : null}
            </div>
          }
          onSubmit={async (v) => {
            let sid = effectiveChoice;
            if (sid === '__new') {
              if (!newSeriesName.trim()) {
                setSeriesError('Name the series, e.g. "Family Christmas".');
                return;
              }
              sid = (await createSeries(newSeriesName)).id;
            }
            const patch = toEventPatch(v);
            const ev = await createEvent({ seriesId: sid, name: patch.name!, year: patch.year! });
            await updateEvent(ev.id, patch);
            navigate(`events/${ev.id}/participants`);
          }}
        />
      </Card>
    </>
  );
}
