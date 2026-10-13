import type { ExchangeEvent } from '../types/models';
import { formatDate, formatMoney } from '../utils/format';

export const DEFAULT_INVITATION =
  "You're invited to {event}! 🎁 Open your personal Secret Santa link to discover who you're buying for:\n{link}\n\nRemember to keep your assignment secret!{details}";

export const DEFAULT_REPLACEMENT =
  'Secret Santa update for {event}: the link I sent you earlier is out of date. Please use this new link instead (draw version {version}):\n{link}\n\nPlease ignore the old one — it still opens, but its information may be out of date.';

function details(event: ExchangeEvent): string {
  const parts: string[] = [];
  if (event.budget !== undefined) parts.push(`Budget: ${formatMoney(event.budget, event.currency)}`);
  if (event.exchangeDate) parts.push(`Exchange: ${formatDate(event.exchangeDate)}`);
  return parts.length ? `\n${parts.join(' · ')}` : '';
}

export function renderInvitation(template: string, event: ExchangeEvent, vars: { name: string; link: string; codename?: string; version: number }): string {
  return template
    .replace(/\{event\}/g, event.name)
    .replace(/\{name\}/g, vars.name)
    .replace(/\{codename\}/g, vars.codename ?? '')
    .replace(/\{version\}/g, String(vars.version))
    .replace(/\{details\}/g, details(event))
    .replace(/\{link\}/g, vars.link);
}
