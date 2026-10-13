import { useState, type FormEvent } from 'react';
import type { ExchangeEvent, ThemeId } from '../../types/models';
import { CURRENCIES } from '../../utils/format';
import { Select, TextArea, TextInput } from '../ui/ui';
import { ThemePicker } from './ThemePicker';

export interface EventDetailsValues {
  name: string;
  year: number;
  exchangeDate: string;
  budget: string;
  currency: string;
  description: string;
  organiserNotes: string;
  theme: ThemeId;
  greeting: string;
  location: string;
  instructions: string;
}

export function valuesFromEvent(ev?: ExchangeEvent): EventDetailsValues {
  const year = ev?.year ?? new Date().getFullYear();
  return {
    name: ev?.name ?? '',
    year,
    exchangeDate: ev?.exchangeDate ?? '',
    budget: ev?.budget !== undefined ? String(ev.budget) : '',
    currency: ev?.currency ?? 'AUD',
    description: ev?.description ?? '',
    organiserNotes: ev?.organiserNotes ?? '',
    theme: ev?.theme ?? 'classic',
    greeting: ev?.greeting ?? '',
    location: ev?.location ?? '',
    instructions: ev?.instructions ?? '',
  };
}

export function toEventPatch(v: EventDetailsValues): Partial<ExchangeEvent> {
  const budget = v.budget.trim() === '' ? undefined : Number(v.budget);
  return {
    name: v.name.trim(),
    year: v.year,
    exchangeDate: v.exchangeDate || undefined,
    budget: budget !== undefined && Number.isFinite(budget) ? budget : undefined,
    currency: v.currency,
    description: v.description.trim() || undefined,
    organiserNotes: v.organiserNotes.trim() || undefined,
    theme: v.theme,
    greeting: v.greeting.trim() || undefined,
    location: v.location.trim() || undefined,
    instructions: v.instructions.trim() || undefined,
  };
}

export function validateDetails(v: EventDetailsValues): Partial<Record<keyof EventDetailsValues, string>> {
  const e: Partial<Record<keyof EventDetailsValues, string>> = {};
  if (!v.name.trim()) e.name = 'Give the exchange a name.';
  if (v.name.length > 200) e.name = 'Keep the name under 200 characters.';
  if (!Number.isInteger(v.year) || v.year < 1900 || v.year > 3000) e.year = 'Enter a year such as 2026.';
  if (v.budget.trim() !== '' && (!Number.isFinite(Number(v.budget)) || Number(v.budget) < 0)) e.budget = 'Enter a positive amount, or leave blank.';
  return e;
}

export function EventDetailsForm({
  initial,
  submitLabel,
  onSubmit,
  extraTop,
}: {
  initial: EventDetailsValues;
  submitLabel: string;
  onSubmit: (v: EventDetailsValues) => Promise<void> | void;
  extraTop?: React.ReactNode;
}) {
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<ReturnType<typeof validateDetails>>({});
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof EventDetailsValues>(k: K, val: EventDetailsValues[K]) => setV((s) => ({ ...s, [k]: val }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs = validateDetails(v);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await onSubmit(v);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      {extraTop}
      <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
        <TextInput label="Exchange name" required value={v.name} onChange={(e) => set('name', e.target.value)} placeholder="Family Christmas 2026" error={errors.name} maxLength={200} />
        <TextInput label="Year" required type="number" inputMode="numeric" value={v.year} onChange={(e) => set('year', Number(e.target.value))} error={errors.year} />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <TextInput label="Exchange date" type="date" value={v.exchangeDate} onChange={(e) => set('exchangeDate', e.target.value)} hint="Optional" />
        <TextInput label="Gift budget" inputMode="decimal" value={v.budget} onChange={(e) => set('budget', e.target.value)} placeholder="50" error={errors.budget} hint="Optional" />
        <Select label="Currency" value={v.currency} onChange={(e) => set('currency', e.target.value)}>
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </div>
      <ThemePicker value={v.theme} onChange={(t) => set('theme', t)} />
      <TextArea label="Personal greeting" value={v.greeting} onChange={(e) => set('greeting', e.target.value)} placeholder="Ho ho ho! Can't wait to see everyone on Christmas Eve." hint="Shown on every participant's reveal page." maxLength={1000} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput label="Where the exchange happens" value={v.location} onChange={(e) => set('location', e.target.value)} placeholder="Grandma's house" maxLength={500} />
        <TextInput label="Short description" value={v.description} onChange={(e) => set('description', e.target.value)} placeholder="Our annual family gift swap" maxLength={2000} />
      </div>
      <TextArea label="Gift exchange instructions" value={v.instructions} onChange={(e) => set('instructions', e.target.value)} placeholder="Bring your wrapped gift with the recipient's name on the tag." maxLength={2000} />
      <TextArea label="Organiser notes (private)" value={v.organiserNotes} onChange={(e) => set('organiserNotes', e.target.value)} hint="Only you can see these. Never included in participant links." maxLength={4000} />
      <div className="flex justify-end">
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
