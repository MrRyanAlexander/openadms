// A project's certifications (adms-certifications; ADR-015, 045, 079, 157, 228): each certifies a
// container or a crew, never a vehicle; its cert number is its placard and its badge. One made on a
// phone arrives with its five photographs; one is entered here from the paper form, with the reason
// it is made in the back office. Its capacity is the server's, worked out from the measured boxes
// (whole inches, the paper form's steps): nobody types a capacity. Later, a certification is
// corrected by permission (prior values kept), its signatures marked on file by QC, and revoked
// from a day (later tickets flagged) or the revocation taken back.
import {
  addCertificationBoxEndpoint,
  correctCertificationEndpoint,
  createCertificationEndpoint,
  listCertificationsEndpoint,
  listListValuesEndpoint,
  listPeopleEndpoint,
  markSignaturesOnFileEndpoint,
  readCertificationEndpoint,
  readProjectEndpoint,
  revokeCertificationEndpoint,
  unrevokeCertificationEndpoint,
  type CertificationsAnswer,
} from '@open-adms/contracts';
import {
  Capacity,
  ProjectClock,
  boxShapes,
  boxSigns,
  type BoxShape,
  type Measurement,
} from '@open-adms/domain';
import { Banner, Button, ScreenTitle, TextEntry } from '@open-adms/look';
import { useState } from 'react';
import { Link } from 'react-aria-components';

import type { NotAnswered } from '../api.ts';
import { SelectField } from '../look/fields.tsx';
import {
  FormDialog,
  nullable,
  picked,
  picks,
  text,
  type FieldSpec,
  type Values,
} from '../look/form-dialog.tsx';
import { PagedTable, Table } from '../look/paged-table.tsx';
import { Photo } from '../look/photo.tsx';
import { Shown, Trouble, useApi, useRead } from '../reading.tsx';
import { holds, useSigned } from '../session.tsx';
import { day, number, say, when, words } from '../words.ts';
import { nameIn, useListOptions, useTold, yesNo, type SetupWritten } from './common.tsx';

type Entry = CertificationsAnswer['certifications'][number];

// One measured box as the intake holds it: its shape, whether it adds or takes away, its feature,
// and each measurement as typed (whole inches).
interface BoxTyped {
  readonly key: string;
  readonly shape: BoxShape;
  readonly sign: 'ADD' | 'SUBTRACT';
  readonly featureId: string | null;
  readonly measures: Readonly<Partial<Record<Measurement, string>>>;
}

const measurementWords: Record<Measurement, keyof typeof words.certifications> = {
  length: 'length',
  secondLength: 'secondLength',
  width: 'width',
  height: 'height',
  diameter: 'diameter',
  radius: 'radius',
  run: 'run',
  corners: 'corners',
};

const allMeasurements: readonly Measurement[] = [
  'length',
  'secondLength',
  'width',
  'height',
  'diameter',
  'radius',
  'run',
  'corners',
];

export function Certifications({ projectId }: { readonly projectId: string }) {
  const said = words.certifications;
  const { session } = useSigned();
  const [project] = useRead(readProjectEndpoint, { params: { projectId } });
  const [certNumber, setCertNumber] = useState('');
  const [adding, setAdding] = useState(false);
  const [reloaded, setReloaded] = useState(0);
  const [told, tell] = useTold();
  const primeName = (id: string) =>
    project.kind === 'answered'
      ? (project.answer.contractors.find((place) => place.contractorId === id)?.name ?? '…')
      : '…';
  return (
    <main data-screen="certifications" className="page" id="content">
      <ScreenTitle>{said.title}</ScreenTitle>
      <p>{said.about}</p>
      {told}
      <div className="page-tools">
        <TextEntry
          label={said.certNumber}
          value={certNumber}
          onChange={setCertNumber}
          longest={40}
        />
        {holds(session, 'CORRECT') ? (
          <Button
            main
            onPress={() => {
              setAdding(true);
            }}
          >
            {said.add}
          </Button>
        ) : null}
      </div>
      <PagedTable
        caption={said.title}
        served={listCertificationsEndpoint}
        asking={{
          params: { projectId },
          query: {
            limit: '50',
            ...(certNumber.trim() === '' ? {} : { certNumber: certNumber.trim() }),
          },
        }}
        rowsOf={(answer) => answer.certifications}
        nextOf={(answer) => answer.next}
        keyOf={(entry: Entry) => entry.certification.id}
        reloaded={reloaded}
        columns={[
          {
            label: said.certNumber,
            names: true,
            cell: (entry) => (
              <Link
                className="link"
                href={`/projects/${projectId}/certifications/${entry.certification.id}`}
              >
                {entry.certification.certNumber}
              </Link>
            ),
          },
          { label: said.kind, cell: (entry) => said.kinds[entry.certification.kind] },
          { label: said.prime, cell: (entry) => primeName(entry.certification.primeId) },
          {
            label: said.capacity,
            numeric: true,
            cell: (entry) =>
              entry.certification.capacityCy === null
                ? words.common.none
                : number(entry.certification.capacityCy),
          },
          {
            label: words.common.state,
            cell: (entry) =>
              entry.certification.revokedFrom === null
                ? said.inService
                : say(said.revoked, { date: day(entry.certification.revokedFrom) }),
          },
          {
            label: said.signaturesOnFile,
            cell: (entry) => yesNo(entry.certification.signaturesOnFile),
          },
        ]}
      />
      {adding && project.kind === 'answered' ? (
        <Intake
          projectId={projectId}
          project={project.answer}
          onSaved={(written) => {
            tell(written);
            setReloaded((count) => count + 1);
            setAdding(false);
          }}
          onClose={() => {
            setAdding(false);
          }}
        />
      ) : null}
    </main>
  );
}

// The fields of a box, by its shape: only the measurements that shape takes (`Capacity`).
function BoxFields({
  box,
  at,
  features,
  onChange,
  onRemove,
}: {
  readonly box: BoxTyped;
  readonly at: number;
  readonly features: readonly { readonly id: string; readonly label: string }[];
  readonly onChange: (box: BoxTyped) => void;
  readonly onRemove: () => void;
}) {
  const said = words.certifications;
  return (
    <fieldset className="rule-line">
      <legend>{say(said.box, { number: at + 1 })}</legend>
      <SelectField
        label={said.shape}
        options={boxShapes.map((shape) => ({ id: shape, label: said.shapes[shape] }))}
        value={box.shape}
        onChange={(shape) => {
          if (shape !== null) onChange({ ...box, shape: shape as BoxShape });
        }}
      />
      <SelectField
        label={said.sign}
        options={boxSigns.map((sign) => ({ id: sign, label: said.signs[sign] }))}
        value={box.sign}
        onChange={(sign) => {
          if (sign !== null) onChange({ ...box, sign: sign as 'ADD' | 'SUBTRACT' });
        }}
      />
      {at === 0 ? null : (
        <SelectField
          label={said.feature}
          options={features}
          value={box.featureId}
          onChange={(featureId) => {
            onChange({ ...box, featureId });
          }}
        />
      )}
      {Capacity.measurementsOf(box.shape).map((measure) => (
        <TextEntry
          key={measure}
          label={said[measurementWords[measure]] as string}
          value={box.measures[measure] ?? ''}
          whole
          onChange={(value) => {
            onChange({ ...box, measures: { ...box.measures, [measure]: value } });
          }}
        />
      ))}
      {at === 0 ? null : (
        <div className="form-actions">
          <Button onPress={onRemove}>{`${said.removeBox} (${String(at + 1)})`}</Button>
        </div>
      )}
    </fieldset>
  );
}

const boxBody = (box: BoxTyped) =>
  ({
    featureId: box.featureId,
    featureOther: null,
    shape: box.shape,
    sign: box.sign,
    ...Object.fromEntries(
      allMeasurements.map((measure) => {
        const typed = box.measures[measure]?.trim() ?? '';
        return [
          measure,
          Capacity.measurementsOf(box.shape).includes(measure) && typed !== ''
            ? Number(typed)
            : null,
        ];
      }),
    ),
  }) as {
    featureId: string | null;
    featureOther: null;
    shape: BoxShape;
    sign: 'ADD' | 'SUBTRACT';
  } & Record<Measurement, number | null>;

// A certification entered from the paper form.
function Intake({
  projectId,
  project,
  onSaved,
  onClose,
}: {
  readonly projectId: string;
  readonly project: {
    readonly project: { readonly timeZone: string };
    readonly contractors: readonly {
      readonly contractorId: string;
      readonly name: string;
      readonly position: string;
    }[];
  };
  readonly onSaved: (written: SetupWritten) => void;
  readonly onClose: () => void;
}) {
  const api = useApi();
  const said = words.certifications;
  const vehicleTypes = useListOptions('vehicle-types');
  const crewTypes = useListOptions('crew-types');
  const features = useListOptions('vehicle-features');
  const [reasons] = useRead(listListValuesEndpoint, {
    params: { list: 'reasons' },
    query: { archived: 'false', limit: '200' },
  });
  const [monitors] = useRead(listPeopleEndpoint, {
    query: { role: 'MONITOR', archived: 'false', order: 'NAME', limit: '200' },
  });
  const [kind, setKind] = useState<'CONTAINER' | 'CREW'>('CONTAINER');
  const [boxes, setBoxes] = useState<readonly BoxTyped[]>([
    { key: crypto.randomUUID(), shape: 'RECTANGLE', sign: 'ADD', featureId: null, measures: {} },
  ]);
  const people =
    monitors.kind === 'answered'
      ? monitors.answer.people.map((person) => ({ id: person.id, label: person.name }))
      : [];
  const reasonOptions =
    reasons.kind === 'answered'
      ? reasons.answer.values
          .filter((value) => (value.uses ?? []).includes('BACK_OFFICE_RECORD'))
          .map((value) => ({ id: value.id, label: value.name }))
      : [];
  const primes = project.contractors
    .filter((place) => place.position === 'PRIME')
    .map((place) => ({ id: place.contractorId, label: place.name }));
  const fields: FieldSpec[] = [
    { kind: 'text', key: 'certNumber', label: said.certNumber, required: true, longest: 40 },
    { kind: 'pick', key: 'primeId', label: said.prime, required: true, options: primes },
    {
      kind: 'text',
      key: 'firstTierSub',
      label: said.firstTierSub,
      hint: said.subHint,
      longest: 200,
    },
    {
      kind: 'text',
      key: 'secondTierSub',
      label: said.secondTierSub,
      hint: said.subHint,
      longest: 200,
    },
    ...(kind === 'CONTAINER'
      ? [
          {
            kind: 'pick',
            key: 'vehicleTypeId',
            label: said.vehicleType,
            options: vehicleTypes,
          } as const,
          {
            kind: 'text',
            key: 'vehicleTypeOther',
            label: said.vehicleTypeOther,
            longest: 200,
          } as const,
        ]
      : [
          {
            kind: 'pick',
            key: 'crewTypeId',
            label: said.crewType,
            options: crewTypes,
            required: true,
          } as const,
        ]),
    { kind: 'text', key: 'driverName', label: said.driverName, longest: 200 },
    { kind: 'text', key: 'driverPhone', label: said.driverPhone, longest: 200 },
    { kind: 'text', key: 'driverLicenceNumber', label: said.licenceNumber, longest: 200 },
    { kind: 'text', key: 'driverLicenceState', label: said.licenceState, longest: 200 },
    { kind: 'date', key: 'driverLicenceExpiry', label: said.licenceExpiry },
    { kind: 'text', key: 'tagNumber', label: said.tagNumber, longest: 200 },
    { kind: 'text', key: 'tagState', label: said.tagState, longest: 200 },
    { kind: 'date', key: 'tagExpiry', label: said.tagExpiry },
    { kind: 'date', key: 'certifiedOn', label: said.certifiedOn, required: true },
    { kind: 'text', key: 'certifiedTime', label: said.certifiedAt, required: true, longest: 5 },
    {
      kind: 'pick',
      key: 'certifiedById',
      label: said.certifiedBy,
      required: true,
      options: people,
    },
    { kind: 'picks', key: 'helperIds', label: said.helpers, options: people },
    { kind: 'text', key: 'clientRep', label: said.clientRep, longest: 200 },
    { kind: 'text', key: 'contractorRep', label: said.contractorRep, longest: 200 },
    { kind: 'long', key: 'notes', label: words.common.notes, longest: 2000 },
    { kind: 'pick', key: 'reasonId', label: said.reason, required: true, options: reasonOptions },
  ];
  const save = async (values: Values): Promise<NotAnswered | null> => {
    const clock = new ProjectClock(project.project.timeZone);
    const at = clock.instantAt(text(values, 'certifiedOn'), text(values, 'certifiedTime'));
    if (at === null) return { kind: 'refused', code: 'BAD_REQUEST', message: said.certifiedAt };
    const reply = await api.ask(createCertificationEndpoint, {
      params: { projectId },
      body: {
        certNumber: text(values, 'certNumber'),
        kind,
        primeId: picked(values, 'primeId') ?? '',
        firstTierSub: nullable(values, 'firstTierSub'),
        secondTierSub: nullable(values, 'secondTierSub'),
        vehicleTypeId: kind === 'CONTAINER' ? picked(values, 'vehicleTypeId') : null,
        vehicleTypeOther: kind === 'CONTAINER' ? nullable(values, 'vehicleTypeOther') : null,
        crewTypeId: kind === 'CREW' ? picked(values, 'crewTypeId') : null,
        boxes: kind === 'CONTAINER' ? boxes.map(boxBody) : [],
        driverName: nullable(values, 'driverName'),
        driverPhone: nullable(values, 'driverPhone'),
        driverLicenceNumber: nullable(values, 'driverLicenceNumber'),
        driverLicenceState: nullable(values, 'driverLicenceState'),
        driverLicenceExpiry: nullable(values, 'driverLicenceExpiry'),
        tagNumber: nullable(values, 'tagNumber'),
        tagState: nullable(values, 'tagState'),
        tagExpiry: nullable(values, 'tagExpiry'),
        certifiedAt: at.toISOString(),
        deviceUtcOffsetMinutes: clock.offsetMinutes(at),
        certifiedById: picked(values, 'certifiedById') ?? '',
        helperIds: picks(values, 'helperIds'),
        clientRepresentativeName: nullable(values, 'clientRep'),
        contractorRepresentativeName: nullable(values, 'contractorRep'),
        replaces: null,
        notes: nullable(values, 'notes'),
        reasonId: picked(values, 'reasonId') ?? '',
      },
    });
    if (reply.kind !== 'answered') return reply;
    onSaved(reply.answer);
    return null;
  };
  return (
    <FormDialog title={said.add} fields={fields} initial={{}} save={save} onClose={onClose}>
      <SelectField
        label={said.kind}
        options={(['CONTAINER', 'CREW'] as const).map((one) => ({
          id: one,
          label: said.kinds[one],
        }))}
        value={kind}
        onChange={(next) => {
          if (next !== null) setKind(next as 'CONTAINER' | 'CREW');
        }}
      />
      {kind === 'CONTAINER' ? (
        <fieldset className="panel">
          <legend>{said.boxes}</legend>
          {boxes.map((box, at) => (
            <BoxFields
              key={box.key}
              box={box}
              at={at}
              features={features}
              onChange={(next) => {
                setBoxes((before) => before.map((one, index) => (index === at ? next : one)));
              }}
              onRemove={() => {
                setBoxes((before) => before.filter((_, index) => index !== at));
              }}
            />
          ))}
          <div className="form-actions">
            <Button
              onPress={() => {
                setBoxes((before) => [
                  ...before,
                  {
                    key: crypto.randomUUID(),
                    shape: 'RECTANGLE',
                    sign: 'ADD',
                    featureId: null,
                    measures: {},
                  },
                ]);
              }}
            >
              {said.addBox}
            </Button>
          </div>
        </fieldset>
      ) : null}
    </FormDialog>
  );
}

// One certification's page: what it holds, its boxes, its photographs, and what a permitted person
// does with it.
export function CertificationPage({
  projectId,
  certificationId,
}: {
  readonly projectId: string;
  readonly certificationId: string;
}) {
  const api = useApi();
  const said = words.certifications;
  const { session } = useSigned();
  const [read, reload] = useRead(readCertificationEndpoint, { params: { certificationId } });
  const [project] = useRead(readProjectEndpoint, { params: { projectId } });
  const vehicleTypes = useListOptions('vehicle-types');
  const crewTypes = useListOptions('crew-types');
  const features = useListOptions('vehicle-features');
  const [open, setOpen] = useState<'correct' | 'revoke' | 'unrevoke' | 'box' | null>(null);
  const [failed, setFailed] = useState<NotAnswered | null>(null);
  const [told, tell] = useTold();
  const done = (answer: SetupWritten): null => {
    tell(answer);
    reload();
    return null;
  };
  const primeName = (id: string | null) =>
    id === null
      ? words.common.none
      : project.kind === 'answered'
        ? (project.answer.contractors.find((place) => place.contractorId === id)?.name ?? '…')
        : '…';
  return (
    <main data-screen="certification" className="page" id="content">
      <Shown read={read}>
        {(answer) => {
          const { certification: cert, boxes, photographs } = answer;
          return (
            <>
              <ScreenTitle>{say(said.page, { number: cert.certNumber })}</ScreenTitle>
              <p>
                <Link className="link" href={`/projects/${projectId}/certifications`}>
                  {said.title}
                </Link>
              </p>
              {told}
              {failed === null ? null : <Trouble reply={failed} />}
              {cert.revokedFrom === null ? null : (
                <Banner tone="notice">
                  <p>{say(said.revoked, { date: day(cert.revokedFrom) })}</p>
                  {cert.revokedReason === null ? null : <p>{cert.revokedReason}</p>}
                </Banner>
              )}
              <dl className="facts">
                <dt>{said.kind}</dt>
                <dd>{said.kinds[cert.kind]}</dd>
                <dt>{said.prime}</dt>
                <dd>{primeName(cert.primeId)}</dd>
                <dt>{said.firstTierSub}</dt>
                <dd>{primeName(cert.firstTierSubId)}</dd>
                <dt>{said.secondTierSub}</dt>
                <dd>{primeName(cert.secondTierSubId)}</dd>
                <dt>{said.capacity}</dt>
                <dd>{cert.capacityCy === null ? words.common.none : number(cert.capacityCy)}</dd>
                <dt>{cert.kind === 'CREW' ? said.crewType : said.vehicleType}</dt>
                <dd>
                  {cert.kind === 'CREW'
                    ? nameIn(crewTypes, cert.crewTypeId)
                    : (cert.vehicleTypeOther ?? nameIn(vehicleTypes, cert.vehicleTypeId))}
                </dd>
                <dt>{said.driverName}</dt>
                <dd>{cert.driverName ?? words.common.none}</dd>
                <dt>{said.tagNumber}</dt>
                <dd>
                  {[cert.tagNumber, cert.tagState].filter(Boolean).join(', ') || words.common.none}
                </dd>
                <dt>{said.tagExpiry}</dt>
                <dd>{cert.tagExpiry === null ? words.common.none : day(cert.tagExpiry)}</dd>
                <dt>{said.certifiedOn}</dt>
                <dd>
                  {project.kind === 'answered'
                    ? when(cert.certifiedAt, project.answer.project.timeZone)
                    : when(cert.certifiedAt)}
                </dd>
                <dt>{said.signaturesOnFile}</dt>
                <dd>{yesNo(cert.signaturesOnFile)}</dd>
                <dt>{words.common.notes}</dt>
                <dd>{cert.notes ?? words.common.none}</dd>
              </dl>
              {cert.kind === 'CONTAINER' ? (
                <Table
                  caption={said.boxes}
                  rows={boxes.filter((box) => box.takenOffAt === null)}
                  keyOf={(box) => box.id}
                  columns={[
                    {
                      label: said.box.replace(' {number}', ''),
                      names: true,
                      numeric: true,
                      cell: (box) => String(box.position),
                    },
                    { label: said.shape, cell: (box) => said.shapes[box.shape as BoxShape] },
                    { label: said.sign, cell: (box) => said.signs[box.sign as 'ADD'] },
                    {
                      label: said.feature,
                      cell: (box) => box.featureOther ?? nameIn(features, box.featureId),
                    },
                    ...allMeasurements.map((measure) => ({
                      label: said[measurementWords[measure]] as string,
                      numeric: true,
                      cell: (box: (typeof boxes)[number]) =>
                        box[measure] === null ? '' : String(box[measure]),
                    })),
                  ]}
                />
              ) : null}
              <h2>{said.photos}</h2>
              {photographs.length === 0 ? (
                <p>{said.noPhotos}</p>
              ) : (
                <div className="photos">
                  {photographs.map((photo) => (
                    <Photo
                      key={photo.id}
                      photoId={photo.id}
                      label={say(words.photos.taken, {
                        what:
                          photo.view === null ? words.photos.photo : words.photos.views[photo.view],
                        when: when(photo.capturedAt),
                      })}
                    />
                  ))}
                </div>
              )}
              <div className="form-actions">
                {holds(session, 'CORRECT') ? (
                  <>
                    <Button
                      onPress={() => {
                        setOpen('correct');
                      }}
                    >
                      {said.correct}
                    </Button>
                    {cert.kind === 'CONTAINER' ? (
                      <Button
                        onPress={() => {
                          setOpen('box');
                        }}
                      >
                        {said.addBox}
                      </Button>
                    ) : null}
                  </>
                ) : null}
                {holds(session, 'QC') ? (
                  <Button
                    onPress={() => {
                      setFailed(null);
                      void api
                        .ask(markSignaturesOnFileEndpoint, {
                          params: { certificationId },
                          body: { onFile: !cert.signaturesOnFile },
                        })
                        .then((reply) => {
                          if (reply.kind === 'answered') done(reply.answer);
                          else setFailed(reply);
                        });
                    }}
                  >
                    {say(words.common.of, {
                      what: said.signaturesOnFile,
                      name: yesNo(!cert.signaturesOnFile),
                    })}
                  </Button>
                ) : null}
                {holds(session, 'CORRECT') ? (
                  <Button
                    onPress={() => {
                      setOpen(cert.revokedFrom === null ? 'revoke' : 'unrevoke');
                    }}
                  >
                    {cert.revokedFrom === null ? said.revoke : said.unrevoke}
                  </Button>
                ) : null}
              </div>
              {open === 'correct' ? (
                <FormDialog
                  title={said.correct}
                  fields={[
                    { kind: 'text', key: 'driverName', label: said.driverName, longest: 200 },
                    { kind: 'text', key: 'tagNumber', label: said.tagNumber, longest: 200 },
                    { kind: 'text', key: 'tagState', label: said.tagState, longest: 200 },
                    { kind: 'date', key: 'tagExpiry', label: said.tagExpiry },
                    { kind: 'text', key: 'clientRep', label: said.clientRep, longest: 200 },
                    { kind: 'text', key: 'contractorRep', label: said.contractorRep, longest: 200 },
                    { kind: 'long', key: 'notes', label: words.common.notes, longest: 2000 },
                    { kind: 'text', key: 'note', label: said.correctNote, longest: 500 },
                  ]}
                  initial={{
                    driverName: cert.driverName ?? '',
                    tagNumber: cert.tagNumber ?? '',
                    tagState: cert.tagState ?? '',
                    tagExpiry: cert.tagExpiry ?? '',
                    clientRep: cert.clientRepresentativeName ?? '',
                    contractorRep: cert.contractorRepresentativeName ?? '',
                    notes: cert.notes ?? '',
                  }}
                  save={async (values) => {
                    const note = text(values, 'note');
                    const reply = await api.ask(correctCertificationEndpoint, {
                      params: { certificationId },
                      body: {
                        changes: {
                          driverName: nullable(values, 'driverName'),
                          tagNumber: nullable(values, 'tagNumber'),
                          tagState: nullable(values, 'tagState'),
                          tagExpiry: nullable(values, 'tagExpiry'),
                          clientRepresentativeName: nullable(values, 'clientRep'),
                          contractorRepresentativeName: nullable(values, 'contractorRep'),
                          notes: nullable(values, 'notes'),
                        },
                        ...(note === '' ? {} : { note }),
                      },
                    });
                    return reply.kind === 'answered' ? done(reply.answer) : reply;
                  }}
                  onClose={() => {
                    setOpen(null);
                  }}
                />
              ) : null}
              {open === 'box' ? (
                <AddBox
                  certificationId={certificationId}
                  position={boxes.length}
                  features={features}
                  onSaved={(written) => {
                    done(written);
                    setOpen(null);
                  }}
                  onClose={() => {
                    setOpen(null);
                  }}
                />
              ) : null}
              {open === 'revoke' || open === 'unrevoke' ? (
                <FormDialog
                  title={open === 'revoke' ? said.revoke : said.unrevoke}
                  fields={[
                    ...(open === 'revoke'
                      ? [
                          {
                            kind: 'date',
                            key: 'from',
                            label: said.revokeFrom,
                            required: true,
                          } as const,
                        ]
                      : []),
                    { kind: 'long', key: 'reason', label: said.revokeReason, longest: 2000 },
                  ]}
                  initial={{}}
                  save={async (values) => {
                    const reply =
                      open === 'revoke'
                        ? await api.ask(revokeCertificationEndpoint, {
                            params: { certificationId },
                            body: { from: text(values, 'from'), reason: text(values, 'reason') },
                          })
                        : await api.ask(unrevokeCertificationEndpoint, {
                            params: { certificationId },
                            body: { reason: text(values, 'reason') },
                          });
                    return reply.kind === 'answered' ? done(reply.answer) : reply;
                  }}
                  onClose={() => {
                    setOpen(null);
                  }}
                />
              ) : null}
            </>
          );
        }}
      </Shown>
    </main>
  );
}

// A box added to a certification, its capacity worked out again by the server.
function AddBox({
  certificationId,
  position,
  features,
  onSaved,
  onClose,
}: {
  readonly certificationId: string;
  readonly position: number;
  readonly features: readonly { readonly id: string; readonly label: string }[];
  readonly onSaved: (written: SetupWritten) => void;
  readonly onClose: () => void;
}) {
  const api = useApi();
  const said = words.certifications;
  const [box, setBox] = useState<BoxTyped>({
    key: 'new',
    shape: 'RECTANGLE',
    sign: 'ADD',
    featureId: null,
    measures: {},
  });
  return (
    <FormDialog
      title={said.addBox}
      fields={[{ kind: 'text', key: 'note', label: said.correctNote, longest: 500 }]}
      initial={{}}
      save={async (values) => {
        const note = text(values, 'note');
        const reply = await api.ask(addCertificationBoxEndpoint, {
          params: { certificationId },
          body: { box: boxBody(box), ...(note === '' ? {} : { note }) },
        });
        if (reply.kind !== 'answered') return reply;
        onSaved(reply.answer);
        return null;
      }}
      onClose={onClose}
    >
      <BoxFields
        box={box}
        at={Math.max(position, 1)}
        features={features}
        onChange={setBox}
        onRemove={onClose}
      />
    </FormDialog>
  );
}
