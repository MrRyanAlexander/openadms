// A QC status set by hand on one record (spec/parts/08-review-and-corrections.md step 7;
// adms-ledger-audit; ADR-107, 117, 168): QC Review, QC Approved, QC Issues or QC Void, with a
// note, on a completed load or haul-out (a split as one, never a single field event), a unit rate
// ticket, a certification, an ROE, a survey, an incident or a drop-off log. It changes nothing on
// the record and reruns nothing; only a QC Approved ticket can be locked as invoiced.
import { setQcStatusEndpoint, type BodyOf, type QcMarkRecord } from '@open-adms/contracts';
import { qcStatuses } from '@open-adms/domain';
import { Button } from '@open-adms/look';
import { useState } from 'react';

import type { NotAnswered } from '../api.ts';
import { FormDialog, picked, text } from '../look/form-dialog.tsx';
import { useApi } from '../reading.tsx';
import type { SetupWritten } from '../setup/common.tsx';
import { say, words } from '../words.ts';

export type QcRecord = BodyOf<typeof setQcStatusEndpoint>['record'];

export function QcMark({
  record,
  name,
  mark,
  onDone,
}: {
  readonly record: QcRecord;
  // What the record is called, for the button's and the dialog's words.
  readonly name: string;
  readonly mark: QcMarkRecord | null;
  readonly onDone: (written: SetupWritten) => void;
}) {
  const api = useApi();
  const said = words.billings.qcMark;
  const [open, setOpen] = useState(false);
  const title = say(words.common.of, { what: said.set, name });
  return (
    <>
      <Button
        onPress={() => {
          setOpen(true);
        }}
      >
        {title}
      </Button>
      {open ? (
        <FormDialog
          title={title}
          fields={[
            {
              kind: 'pick',
              key: 'status',
              label: said.status,
              required: true,
              options: qcStatuses.map((each) => ({ id: each, label: words.review.qc[each] })),
            },
            { kind: 'text', key: 'note', label: words.review.note, longest: 500 },
          ]}
          initial={{ status: mark?.status ?? 'QC_APPROVED', note: mark?.note ?? '' }}
          save={async (values): Promise<NotAnswered | null> => {
            const note = text(values, 'note');
            const reply = await api.ask(setQcStatusEndpoint, {
              body: {
                record,
                status: qcStatuses.find((each) => each === picked(values, 'status')) ?? 'QC_REVIEW',
                ...(note === '' ? {} : { note }),
              },
            });
            if (reply.kind !== 'answered') return reply;
            onDone(reply.answer);
            return null;
          }}
          onClose={() => {
            setOpen(false);
          }}
        >
          <p>{said.about}</p>
        </FormDialog>
      ) : null}
    </>
  );
}
