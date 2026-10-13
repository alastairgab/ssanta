import type { EventStatus } from '../../types/models';
import { Badge } from '../ui/ui';

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  draft: 'Draft',
  'draw-generated': 'Draw generated',
  'draw-confirmed': 'Draw confirmed',
  'links-ready': 'Links ready',
  archived: 'Archived',
};

export function EventStatusBadge({ status }: { status: EventStatus }) {
  const tone = ({ draft: 'neutral', 'draw-generated': 'gold', 'draw-confirmed': 'blue', 'links-ready': 'green', archived: 'grey' } as const)[status];
  return <Badge tone={tone}>{EVENT_STATUS_LABELS[status]}</Badge>;
}
