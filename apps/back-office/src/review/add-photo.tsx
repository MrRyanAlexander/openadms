// A photograph added in the back office to a record made there from paper (spec/parts/08-review-
// and-corrections.md step 9; ADR-521, 534): its file sent whole, as the person picked it, with
// when it was taken (the file's own time on the person's computer, read in the project's time
// zone). The server reads its kind from its own first bytes and keeps it once; a record a phone
// made takes its photographs from its phone only, and is refused here.
import { addPhotographEndpoint, backOfficePhotographOwners } from '@open-adms/contracts';
import { useState } from 'react';

import type { NotAnswered } from '../api.ts';
import { FileField } from '../look/fields.tsx';
import { useApi } from '../reading.tsx';
import type { SetupWritten } from '../setup/common.tsx';
import { say, words } from '../words.ts';
import { useReviewing } from './reviewing.tsx';

export function AddPhoto({
  on,
  recordId,
  name,
  onDone,
  onFailed,
}: {
  readonly on: (typeof backOfficePhotographOwners)[number];
  readonly recordId: string;
  // What the record is called, for the field's label.
  readonly name: string;
  readonly onDone: (written: SetupWritten) => void;
  readonly onFailed: (reply: NotAnswered) => void;
}) {
  const api = useApi();
  const { clock } = useReviewing();
  const [busy, setBusy] = useState(false);
  return (
    <FileField
      label={say(words.review.addPhoto, { name })}
      accept="image/jpeg,image/png,image/heic,image/heif,image/tiff"
      busy={busy}
      onFile={(file) => {
        const taken = new Date(file.lastModified);
        setBusy(true);
        void api
          .ask(addPhotographEndpoint, {
            query: {
              on,
              recordId,
              capturedAt: taken.toISOString(),
              utcOffsetMinutes: String(clock.offsetMinutes(taken)),
            },
            bytes: { data: file, type: file.type === '' ? 'application/octet-stream' : file.type },
          })
          .then((reply) => {
            setBusy(false);
            if (reply.kind === 'answered') onDone(reply.answer);
            else onFailed(reply);
          });
      }}
    />
  );
}
