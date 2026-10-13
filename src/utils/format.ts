import type { Participant } from '../types/models';

export function formatDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function formatDateTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatMoney(amount?: number, currency = 'AUD'): string {
  if (amount === undefined || amount === null || Number.isNaN(amount)) return '';
  try {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

/** Organiser-facing label that disambiguates duplicate names. */
export function participantLabel(p: Pick<Participant, 'displayName' | 'disambiguator'> | undefined): string {
  if (!p) return 'Unknown participant';
  return p.disambiguator ? `${p.displayName} (${p.disambiguator})` : p.displayName;
}

export function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}

export function listToSentence(items: string[]): string {
  if (items.length <= 1) return items.join('');
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export const CURRENCIES = ['AUD', 'NZD', 'USD', 'CAD', 'GBP', 'EUR', 'JPY', 'SGD', 'HKD', 'INR', 'ZAR', 'CHF', 'SEK', 'NOK', 'DKK'];
