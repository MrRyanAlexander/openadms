// The audit trail of a project (REQ-407; ARCHITECTURE §5.3; invariants 2, 3; ADR-097, 544): every
// change to its records, newest first, as the database wrote it, read-only (the log is evidence).
// Narrowed by its domain (security, billing, operations, records) and by who made the change;
// each reader is shown what their areas let them read, the security domain an admin's alone.
import { auditDomains, readProjectAuditTrailEndpoint } from '@open-adms/contracts';
import { ScreenTitle } from '@open-adms/look';
import { useState } from 'react';

import { SelectField } from '../look/fields.tsx';
import { AuditEntries } from '../review/history.tsx';
import { Reviewed, useReviewing } from '../review/reviewing.tsx';
import { words } from '../words.ts';

export function AuditTrail({ projectId }: { readonly projectId: string }) {
  return (
    <main data-screen="audit-trail" className="page" id="content">
      <Reviewed projectId={projectId}>
        <TrailOf projectId={projectId} />
      </Reviewed>
    </main>
  );
}

const any = '';

function TrailOf({ projectId }: { readonly projectId: string }) {
  const said = words.billings.audit;
  const { names } = useReviewing();
  const [domain, setDomain] = useState<string>(any);
  const [actor, setActor] = useState<string>(any);
  const domainPicked = auditDomains.find((each) => each === domain);
  return (
    <>
      <ScreenTitle>{said.title}</ScreenTitle>
      <p>{said.about}</p>
      <div className="page-tools">
        <SelectField
          label={said.domain}
          options={[
            { id: any, label: said.every },
            ...auditDomains.map((each) => ({ id: each, label: said.domains[each] })),
          ]}
          value={domain}
          onChange={(value) => {
            setDomain(value ?? any);
          }}
        />
        <SelectField
          label={said.actor}
          options={[
            { id: any, label: said.everyone },
            ...names.people.map((person) => ({ id: person.id, label: person.name })),
          ]}
          value={actor}
          onChange={(value) => {
            setActor(value ?? any);
          }}
        />
      </div>
      <AuditEntries
        caption={said.title}
        served={readProjectAuditTrailEndpoint}
        asking={{
          params: { projectId },
          query: {
            limit: '100',
            ...(domainPicked === undefined ? {} : { domain: domainPicked }),
            ...(actor === any ? {} : { actorId: actor }),
          },
        }}
      />
    </>
  );
}
