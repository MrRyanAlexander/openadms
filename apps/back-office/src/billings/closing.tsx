// Closing and reopening a project (spec/parts/09-invoice-deliver-closeout.md, closeout step 5;
// ADR-025, 529 (b); AC-09-29): an admin reads what is still open (phones that took its work and
// weren't turned in, tickets not QC Approved or not locked, records waiting for a person), which
// never stops the close; closed, its assignments are withdrawn and its phones' unused numbers
// retired, and nothing in it changes after, whoever writes. Nothing is deleted. An admin reopens
// it with a reason, audited.
import {
  closeProjectEndpoint,
  closingCheckEndpoint,
  readProjectEndpoint,
  reopenProjectEndpoint,
} from '@open-adms/contracts';
import { Banner, Button, ScreenTitle } from '@open-adms/look';
import { useState } from 'react';

import { FormDialog, text } from '../look/form-dialog.tsx';
import { Table } from '../look/paged-table.tsx';
import { Shown, useApi, useRead } from '../reading.tsx';
import { isAdmin, useSigned } from '../session.tsx';
import { useTold } from '../setup/common.tsx';
import { say, when, words } from '../words.ts';

export function Closing({ projectId }: { readonly projectId: string }) {
  const api = useApi();
  const said = words.billings.closing;
  const { session } = useSigned();
  const admin = isAdmin(session);
  const [project, reloadProject] = useRead(readProjectEndpoint, { params: { projectId } });
  const [check, reloadCheck] = useRead(
    closingCheckEndpoint,
    admin ? { params: { projectId } } : null,
  );
  const [open, setOpen] = useState<'close' | 'reopen' | null>(null);
  const [told, tell] = useTold();
  const done = () => {
    reloadProject();
    reloadCheck();
  };
  return (
    <main data-screen="closing" className="page" id="content">
      <ScreenTitle>{said.title}</ScreenTitle>
      <p>{said.about}</p>
      {told}
      <Shown read={project}>
        {(answer) =>
          answer.project.closedAt === null ? (
            <>
              <p>{said.open}</p>
              {!admin ? (
                <p className="quiet">{said.adminsOnly}</p>
              ) : (
                <>
                  <Shown read={check}>
                    {(open_) =>
                      open_.items.length === 0 ? (
                        <p role="status">{said.nothingOpen}</p>
                      ) : (
                        <Table
                          caption={said.stillOpen}
                          rows={open_.items.map((item, at) => ({
                            ...item,
                            key: `${item.code}-${String(at)}`,
                          }))}
                          keyOf={(item) => item.key}
                          columns={[
                            { label: said.item, names: true, cell: (item) => item.message },
                          ]}
                        />
                      )
                    }
                  </Shown>
                  <div className="page-tools">
                    <Button
                      main
                      onPress={() => {
                        setOpen('close');
                      }}
                    >
                      {said.close}
                    </Button>
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <Banner tone="notice">
                <p>
                  {say(said.closedAt, {
                    at: when(answer.project.closedAt, answer.project.timeZone),
                  })}
                </p>
              </Banner>
              {admin ? (
                <div className="page-tools">
                  <Button
                    onPress={() => {
                      setOpen('reopen');
                    }}
                  >
                    {said.reopen}
                  </Button>
                </div>
              ) : null}
            </>
          )
        }
      </Shown>
      {open === 'close' ? (
        <FormDialog
          title={said.close}
          fields={[]}
          initial={{}}
          saveLabel={said.close}
          save={async () => {
            const reply = await api.ask(closeProjectEndpoint, { params: { projectId } });
            if (reply.kind !== 'answered') return reply;
            tell(reply.answer);
            done();
            return null;
          }}
          onClose={() => {
            setOpen(null);
          }}
        >
          <p>{said.closeAbout}</p>
        </FormDialog>
      ) : null}
      {open === 'reopen' ? (
        <FormDialog
          title={said.reopen}
          fields={[
            { kind: 'text', key: 'reason', label: said.reason, required: true, longest: 500 },
          ]}
          initial={{}}
          saveLabel={said.reopen}
          save={async (values) => {
            const reply = await api.ask(reopenProjectEndpoint, {
              params: { projectId },
              body: { reason: text(values, 'reason') },
            });
            if (reply.kind !== 'answered') return reply;
            tell(reply.answer);
            done();
            return null;
          }}
          onClose={() => {
            setOpen(null);
          }}
        />
      ) : null}
    </main>
  );
}
