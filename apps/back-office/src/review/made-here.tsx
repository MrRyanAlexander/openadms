// A field event made in the back office because a phone failed (spec/parts/08-review-and-
// corrections.md step 9; adms-exceptions; ADR-156): its kind and number, the monitor whose work it
// was, when and where, the cert number and what its kind records, with a reason picked from the
// firm's list. It is a field event like any other: its ticket is queued, it pairs by its number,
// and the worker flags it as made in the back office, naming the person and the reason.
import { createFieldEventEndpoint, type FieldEventRecord } from '@open-adms/contracts';
import { kindsOfWorkflow, type FieldEventKindName, type WorkflowName } from '@open-adms/domain';
import { useState } from 'react';

import { ChoiceField } from '../look/fields.tsx';
import { FormDialog, picked, text, type Values } from '../look/form-dialog.tsx';
import { useApi } from '../reading.tsx';
import { words } from '../words.ts';
import { capturedOf, fieldEventFields } from './field-event-form.tsx';
import { reasonsFor, useReviewing } from './reviewing.tsx';

export function NewFieldEvent({
  projectId,
  workflow,
  number = '',
  onClose,
  onMade,
}: {
  readonly projectId: string;
  readonly workflow: WorkflowName;
  // The ticket it is made under, where the reviewer is on one already.
  readonly number?: string;
  readonly onClose: () => void;
  readonly onMade: (made: FieldEventRecord) => void;
}) {
  const api = useApi();
  const { names, clock } = useReviewing();
  const said = words.review.made;
  const kinds = kindsOfWorkflow[workflow];
  const [kind, setKind] = useState<FieldEventKindName>(kinds[0] ?? 'COLLECTION');
  const today = clock.day(new Date());
  return (
    <FormDialog
      title={said.title}
      fields={[
        {
          kind: 'text',
          key: 'ticketNumber',
          label: said.ticketNumber,
          required: true,
          longest: 40,
        },
        ...(kind === 'COLLECTION' || kind === 'HAUL_OUT_COLLECTION'
          ? [
              {
                kind: 'text' as const,
                key: 'splitSuffix',
                label: said.splitSuffix,
                hint: said.splitSuffixHint,
                longest: 4,
              },
            ]
          : []),
        {
          kind: 'pick',
          key: 'reasonId',
          label: said.reason,
          required: true,
          options: reasonsFor(names, 'BACK_OFFICE_RECORD'),
        },
        ...fieldEventFields(kind, names, null),
      ]}
      initial={{ ticketNumber: number, startDay: today, endDay: today }}
      saveLabel={said.make}
      save={async (values: Values) => {
        const details = capturedOf(kind, values, clock);
        const startedAt = new Date(details.startedAt ?? Date.now());
        const suffix = text(values, 'splitSuffix');
        const reply = await api.ask(createFieldEventEndpoint, {
          params: { projectId },
          body: {
            ...details,
            monitorId: details.monitorId ?? '',
            startedAt: details.startedAt ?? '',
            endedAt: details.endedAt ?? '',
            certNumber: details.certNumber ?? '',
            deviceUtcOffsetMinutes: clock.offsetMinutes(startedAt),
            workflow,
            kind,
            ticketNumber: text(values, 'ticketNumber'),
            ...(suffix === '' ? {} : { splitSuffix: suffix.toUpperCase() }),
            reasonId: picked(values, 'reasonId') ?? '',
          },
        });
        if (reply.kind !== 'answered') return reply;
        onMade(reply.answer.record);
        return null;
      }}
      onClose={onClose}
    >
      <p>{said.about}</p>
      <ChoiceField
        label={said.kind}
        options={kinds.map((each) => ({ id: each, label: words.review.kinds[each] }))}
        value={kind}
        onChange={(each) => {
          setKind(kinds.find((one) => one === each) ?? kind);
        }}
      />
    </FormDialog>
  );
}
