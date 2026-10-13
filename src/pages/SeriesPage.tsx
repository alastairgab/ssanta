import { useState } from 'react';
import { href } from '../app/router';
import { Icon } from '../components/ui/icons';
import { Card, PageHeader, SectionTitle, TextArea, TextInput, useToast } from '../components/ui/ui';
import { EventStatusBadge } from '../components/dashboard/EventStatusBadge';
import { useEvents, useSeriesList } from '../hooks/useData';
import { updateSeries } from '../services/storage';

export default function SeriesPage({ seriesId }: { seriesId: string }) {
  const series = useSeriesList();
  const events = useEvents();
  const toast = useToast();
  const s = series?.find((x) => x.id === seriesId);
  const [name, setName] = useState<string | null>(null);
  const [desc, setDesc] = useState<string | null>(null);
  if (!series || !events) return null;
  if (!s) return <p>Series not found.</p>;
  const evs = events.filter((e) => e.seriesId === s.id).sort((a, b) => b.year - a.year);
  return (
    <>
      <PageHeader
        title={s.name}
        subtitle={`${evs.length} exchange${evs.length === 1 ? '' : 's'} in this series`}
        action={
          <a className="btn-primary" href={href(`events/new?series=${s.id}`)}>
            <Icon.Plus className="h-4 w-4" /> Add a year
          </a>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <SectionTitle title="Years" />
          <ul className="divide-y divide-pine-100">
            {evs.map((e) => (
              <li key={e.id} className="flex items-center gap-3 py-3">
                <span className="w-14 font-display text-xl font-semibold">{e.year}</span>
                <a className="flex-1 font-medium hover:underline" href={href(`events/${e.id}`)}>
                  {e.name}
                </a>
                <EventStatusBadge status={e.status} />
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <SectionTitle title="Series details" />
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              await updateSeries(s.id, { name: (name ?? s.name).trim() || s.name, description: (desc ?? s.description ?? '').trim() || undefined });
              toast('Saved');
            }}
          >
            <TextInput label="Name" value={name ?? s.name} onChange={(e) => setName(e.target.value)} maxLength={200} />
            <TextArea label="Description" value={desc ?? s.description ?? ''} onChange={(e) => setDesc(e.target.value)} maxLength={2000} />
            <button type="submit" className="btn-secondary">
              Save
            </button>
          </form>
        </Card>
      </div>
    </>
  );
}
