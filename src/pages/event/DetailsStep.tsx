import { Card, SectionTitle, useToast } from '../../components/ui/ui';
import { EventDetailsForm, toEventPatch, valuesFromEvent } from '../../components/dashboard/EventDetailsForm';
import { updateEvent } from '../../services/storage';
import type { EventCtx } from './EventWorkspace';

export default function DetailsStep({ ctx }: { ctx: EventCtx }) {
  const toast = useToast();
  return (
    <Card>
      <SectionTitle
        title="Exchange details"
        description={
          ctx.activeDraw
            ? 'Changes here appear in links you generate from now on. Links you already sent keep the details they were created with.'
            : 'These details appear on every participant’s reveal page.'
        }
      />
      <EventDetailsForm
        key={ctx.event.updatedAt}
        initial={valuesFromEvent(ctx.event)}
        submitLabel="Save details"
        onSubmit={async (v) => {
          await updateEvent(ctx.event.id, toEventPatch(v));
          toast('Details saved');
        }}
      />
    </Card>
  );
}
