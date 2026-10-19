// The forms that are no ticket's, on the phone (adms-ticket-workflows §4.6; adms-field-app §4A.6;
// BACKLOG 3.5.4, C66, C67 (c), C69, C118, C127; REQ-307, 309; AC-04-80, 83, 86…88, 99, 101,
// AC-11-05, 84…87; ADR-149, 150, 160, 181, 184, 188, 215, 328, 334, 477, 571, 573, 584): an ROE, a
// pre- or post-work survey, an incident and a citizen drop-off log, each from New to submitted.
//
// - **Every start is start → a list → maybe a sub-list → the details** (ADR-127): **an ROE** takes
//   its number at New, the phone's next of its ROE block written `R-0007` or the paper ROE's own,
//   and typed again, a person having copied it (Q-218, ADR-573); **a survey** its work type (the
//   firm's list, the ROE's own work type left to the ROE's button); **an incident** its type, then
//   the firm's sub-type where it has any; **a drop-off log** nothing: its site is the
//   assignment's (ADR-195, 215), and it opens straight away.
// - **The details**: an ROE's parcel, owner, address and whether and when it was signed; a
//   survey's ROE (a post-work survey's offered from those whose pre-work survey is done, the
//   domain's `PhoneSurveys`; C118) and its number as written; an incident's description and
//   parties, then **only what the project's incident form offers** (AC-04-101): the contractor
//   involved by name, a cert number, an ROE; a drop-off's resident and where the debris came from.
// - **Where it was**: the phone's fix, and an ROE's or an incident's address looked up or typed.
//   **"GPS required" is the ROE form's** (ADR-181): where it is set the ROE asks for the place at
//   the property, and otherwise records none; every other form records the place. A fix is never
//   waited for: none, and the form goes without one (ADR-083).
// - **The firm's own fields** (ADR-160, 278; C69): the newest version the lists held when the form
//   was begun, each field by its type; a required one unanswered holds Next, data entry and never
//   eligibility, but never a photograph's (the camera may be refused: AC-11-68).
// - Photographs at any step, at most eight; the review, every value once; **sealed at submit**
//   (ADR-477): nothing a monitor does after changes it (C66).
//
// Nothing here waits on the server (ADR-030; AC-11-05), and nothing is refused (ADR-052): what is
// left out is the server's to flag.
import { unansweredOf, type PhoneAssignmentAnswer } from '@open-adms/contracts';
import { PhoneSurveys, ticketPhotosAtMost } from '@open-adms/domain';
import { Fragment, useEffect, useId, useRef, useState, type ReactNode } from 'react';

import {
  PhotoDrawn,
  photoLabel,
  PlaceFields,
  Step,
  TicketPhotos,
  TypeAgain,
  typedAddressChange,
} from './capture.tsx';
import {
  Banner,
  Button,
  ListPicker,
  ScanField,
  StatusStrip,
  TextEntry,
  type Standing,
} from './look/index.ts';
import { Camera } from './look/icons.tsx';
import type { FormDetails, FormKind, OwnAnswer, PhoneForm } from './phone/forms.ts';
import type { HeldLists } from './phone/lists.ts';
import type { SignedIn } from './phone/monitor.ts';
import { workOfForm } from './phone/works.ts';
import type { CaptureParts } from './ticket-capture.tsx';
import { say, timeOfDay, words } from './words.ts';

const said = words.forms;
// How many characters a record keeps of words typed, an answer typed and a number as written
// (the sync contract's).
const wordsLongest = 2000;
const answerLongest = 4000;
const numberLongest = 40;

// Where the form is: New, being filled in, a photograph shown, or submitted.
export type Filling =
  | { readonly at: 'new'; readonly kind: Exclude<FormKind, 'DROP_OFF_LOG'> }
  | { readonly at: 'fill'; readonly id: string }
  | { readonly at: 'photo'; readonly id: string; readonly photoId: string }
  | { readonly at: 'submitted'; readonly id: string };

// Each form's New and the screen it is filled in on, each named once by its literal.
function FormScreen({
  kind,
  at,
  children,
}: {
  readonly kind: FormKind;
  readonly at: 'new' | 'fill';
  readonly children: ReactNode;
}) {
  if (at === 'new') {
    switch (kind) {
      case 'ROE':
        return (
          <main data-screen="new-roe" className="screen">
            {children}
          </main>
        );
      case 'SURVEY':
        return (
          <main data-screen="new-survey" className="screen">
            {children}
          </main>
        );
      case 'INCIDENT':
      case 'DROP_OFF_LOG':
        return (
          <main data-screen="new-incident" className="screen">
            {children}
          </main>
        );
    }
  }
  switch (kind) {
    case 'ROE':
      return (
        <main data-screen="fill-roe" className="screen">
          {children}
        </main>
      );
    case 'SURVEY':
      return (
        <main data-screen="fill-survey" className="screen">
          {children}
        </main>
      );
    case 'INCIDENT':
      return (
        <main data-screen="fill-incident" className="screen">
          {children}
        </main>
      );
    case 'DROP_OFF_LOG':
      return (
        <main data-screen="fill-drop-off-log" className="screen">
          {children}
        </main>
      );
  }
}

type FormStep =
  | 'property'
  | 'signed'
  | 'roe'
  | 'number'
  | 'details'
  | 'contractor'
  | 'cert'
  | 'resident'
  | 'place'
  | 'own'
  | 'photos'
  | 'notes'
  | 'review';

// What a form of a kind begins with: who, on what, the version of its own fields the lists hold.
export function formBegun(
  kind: FormKind,
  signedIn: SignedIn,
  assignment: PhoneAssignmentAnswer,
  held: HeldLists,
) {
  const definition = held.lists.forms.find((form) => form.documentType === kind)?.definition;
  return {
    kind,
    monitorId: signedIn.userId,
    projectId: assignment.project.id,
    timeZone: assignment.project.timeZone,
    assignmentId: assignment.id,
    setupVersion: held.lists.setupVersion,
    siteId: assignment.site?.id ?? null,
    formDefinitionId: definition?.id ?? null,
    step: stepsOf(kind, held)[0] ?? 'review',
  } as const;
}

const gpsRequired = (kind: FormKind, held: HeldLists): boolean =>
  held.lists.forms.find((form) => form.documentType === kind)?.gpsRequired === true;

const ownFieldsOf = (form: Pick<PhoneForm, 'kind' | 'formDefinitionId'>, held: HeldLists) => {
  const definition = held.lists.forms.find((one) => one.documentType === form.kind)?.definition;
  return definition?.id !== undefined && definition.id === form.formDefinitionId
    ? definition.fields
    : [];
};

// The steps a form of a kind takes, by what the project's forms say.
function stepsOf(kind: FormKind, held: HeldLists, fields: readonly unknown[] = []): FormStep[] {
  const own: FormStep[] = fields.length === 0 ? [] : ['own'];
  switch (kind) {
    case 'ROE':
      return [
        'property',
        'signed',
        ...(gpsRequired(kind, held) ? (['place'] as const) : []),
        ...own,
        'photos',
        'review',
      ];
    case 'SURVEY':
      return ['roe', 'number', 'place', ...own, 'photos', 'notes', 'review'];
    case 'INCIDENT': {
      const offers = held.lists.incidentOffers;
      return [
        'details',
        ...(offers.includes('CONTRACTOR') ? (['contractor'] as const) : []),
        ...(offers.includes('CERT_NUMBER') ? (['cert'] as const) : []),
        ...(offers.includes('ROE_NUMBER') ? (['roe'] as const) : []),
        'place',
        ...own,
        'photos',
        'notes',
        'review',
      ];
    }
    case 'DROP_OFF_LOG':
      return ['resident', 'place', ...own, 'photos', 'notes', 'review'];
  }
}

// What a form is called on home's open list, in its title and once submitted.
export function formTitle(form: PhoneForm, held: HeldLists | undefined): string {
  const lists = held?.lists;
  const named = (list: readonly { id: string; name: string }[] | undefined, id: string | null) =>
    list?.find((one) => one.id === id)?.name ?? said.kinds[form.kind];
  switch (form.kind) {
    case 'ROE':
      return say(words.home.open.form.ROE, { number: form.roeNumber ?? '' });
    case 'SURVEY':
      return say(words.home.open.form.SURVEY, {
        workType: named(lists?.surveyWorkTypes, form.workTypeId),
      });
    case 'INCIDENT':
      return say(words.home.open.form.INCIDENT, {
        type: named(lists?.incidentTypes, form.incidentTypeId),
      });
    case 'DROP_OFF_LOG':
      return words.home.open.form.DROP_OFF_LOG;
  }
}

export function FormCapture({
  parts,
  signedIn,
  assignment,
  held,
  standing,
  start,
  onHome,
  after,
}: {
  readonly parts: CaptureParts;
  readonly signedIn: SignedIn;
  readonly assignment: PhoneAssignmentAnswer;
  readonly held: HeldLists;
  readonly standing: Standing;
  readonly start: Filling;
  readonly onHome: () => void;
  // What shows below every screen: the warning before the lock after inactivity.
  readonly after?: ReactNode;
}) {
  const [at, setAt] = useState<Filling>(start);
  const form = 'id' in at ? parts.forms.form(at.id) : undefined;

  switch (at.at) {
    case 'new':
      return (
        <NewForm
          kind={at.kind}
          parts={parts}
          signedIn={signedIn}
          assignment={assignment}
          held={held}
          standing={standing}
          onOpened={(opened) => {
            setAt({ at: 'fill', id: opened.id });
          }}
          onCancel={onHome}
          below={after}
        />
      );
    case 'fill':
      if (form === undefined) return null;
      return (
        <FillForm
          key={form.id}
          parts={parts}
          form={form}
          held={held}
          assignment={assignment}
          standing={standing}
          onPhoto={(photoId) => {
            setAt({ at: 'photo', id: form.id, photoId });
          }}
          onSubmitted={() => {
            setAt({ at: 'submitted', id: form.id });
          }}
          onLeave={onHome}
          below={after}
        />
      );
    case 'photo': {
      const photo = form?.photos.find(({ id }) => id === at.photoId);
      if (form === undefined || photo === undefined) return null;
      const back = () => {
        setAt({ at: 'fill', id: form.id });
      };
      return (
        <main data-screen="form-photo" className="screen">
          <StatusStrip standing={standing} />
          <div className="screen-body">
            <h1>{photoLabel(form, photo)}</h1>
            <PhotoDrawn tickets={parts.forms} photo={photo} label={photoLabel(form, photo)} large />
          </div>
          <div className="screen-actions">
            <Button main wide onPress={back}>
              {said.photoBack}
            </Button>
            {form.state === 'OPEN' ? (
              <Button
                wide
                onPress={() => {
                  void parts.forms.photoRemoved(form.id, photo.id).then(back);
                }}
              >
                {words.capture.photos.remove}
              </Button>
            ) : null}
          </div>
          {after}
        </main>
      );
    }
    case 'submitted': {
      if (form === undefined) return null;
      const { kind } = form;
      return (
        <main data-screen="form-submitted" className="screen">
          <StatusStrip standing={standing} />
          <div className="screen-body">
            <h1>{say(said.submitted.title, { kind: formTitle(form, held) })}</h1>
            <Banner tone="good" announced>
              <p>{said.submitted.saved}</p>
            </Banner>
            <p className="quiet">{said.submitted.sealed}</p>
          </div>
          <div className="screen-actions">
            {kind === 'DROP_OFF_LOG' ? (
              <Button
                main
                wide
                onPress={() => {
                  void parts.forms
                    .begin(formBegun('DROP_OFF_LOG', signedIn, assignment, held))
                    .then((opened) => {
                      setAt({ at: 'fill', id: opened.id });
                    });
                }}
              >
                {words.home.start.dropOff}
              </Button>
            ) : (
              <Button
                main
                wide
                onPress={() => {
                  setAt({ at: 'new', kind });
                }}
              >
                {words.home.start[workOfForm[kind]]}
              </Button>
            )}
            <Button wide onPress={onHome}>
              {said.submitted.home}
            </Button>
          </div>
          {after}
        </main>
      );
    }
  }
}

// New: an ROE's number, a survey's work type, an incident's type and sub-type.
function NewForm({
  kind,
  parts,
  signedIn,
  assignment,
  held,
  standing,
  onOpened,
  onCancel,
  below,
}: {
  readonly kind: Exclude<FormKind, 'DROP_OFF_LOG'>;
  readonly parts: CaptureParts;
  readonly signedIn: SignedIn;
  readonly assignment: PhoneAssignmentAnswer;
  readonly held: HeldLists;
  readonly standing: Standing;
  readonly onOpened: (form: PhoneForm) => void;
  readonly onCancel: () => void;
  readonly below?: ReactNode;
}) {
  const titleId = useId();
  const { lists } = held;
  const [incidentTypeId, setIncidentTypeId] = useState<string | null>(null);
  const begin = (start: Partial<FormDetails>, roe?: { number: string; from: 'MADE' | 'TYPED' }) => {
    void parts.forms
      .begin({
        ...formBegun(kind, signedIn, assignment, held),
        start,
        ...(roe === undefined ? {} : { roe }),
      })
      .then(onOpened);
  };
  const frame = (title: string, actions: ReactNode, children: ReactNode, onBack = onCancel) => (
    <FormScreen kind={kind} at="new">
      <Step
        standing={standing}
        title={title}
        titleId={titleId}
        step={1}
        steps={1}
        onBack={onBack}
        actions={
          <>
            {actions}
            <Button wide onPress={onCancel}>
              {said.cancel}
            </Button>
          </>
        }
      >
        {children}
      </Step>
      {below}
    </FormScreen>
  );

  switch (kind) {
    case 'ROE':
      return <NewRoe parts={parts} titleId={titleId} frame={frame} begin={begin} />;
    case 'SURVEY':
      return frame(
        said.survey.typeTitle,
        null,
        <ListPicker
          labelledBy={titleId}
          choices={lists.surveyWorkTypes
            .filter(({ key }) => key !== 'ROE')
            .map(({ id, name }) => ({ key: id, label: name }))}
          picked={null}
          onPick={(workTypeId) => {
            begin({ workTypeId });
          }}
        />,
      );
    case 'INCIDENT': {
      const type = lists.incidentTypes.find(({ id }) => id === incidentTypeId);
      if (type !== undefined && type.subTypes.length > 0) {
        return frame(
          say(said.incident.subTypeTitle, { type: type.name }),
          null,
          <ListPicker
            labelledBy={titleId}
            choices={type.subTypes.map(({ id, name }) => ({ key: id, label: name }))}
            picked={null}
            onPick={(incidentSubTypeId) => {
              begin({ incidentTypeId: type.id, incidentSubTypeId });
            }}
          />,
          () => {
            setIncidentTypeId(null);
          },
        );
      }
      return frame(
        said.incident.typeTitle,
        null,
        <ListPicker
          labelledBy={titleId}
          choices={lists.incidentTypes.map(({ id, name }) => ({ key: id, label: name }))}
          picked={incidentTypeId}
          onPick={(picked) => {
            const subTypes = lists.incidentTypes.find(({ id }) => id === picked)?.subTypes ?? [];
            if (subTypes.length === 0) begin({ incidentTypeId: picked, incidentSubTypeId: null });
            else setIncidentTypeId(picked);
          }}
        />,
      );
    }
  }
}

// An ROE's number: the phone's next, shown, written on the paper and typed again; or the paper's
// own, typed twice. The ROE opens only once the two match.
function NewRoe({
  parts,
  titleId,
  frame,
  begin,
}: {
  readonly parts: CaptureParts;
  readonly titleId: string;
  readonly frame: (
    title: string,
    actions: ReactNode,
    children: ReactNode,
    onBack?: () => void,
  ) => ReactNode;
  readonly begin: (
    start: Partial<FormDetails>,
    roe: { number: string; from: 'MADE' | 'TYPED' },
  ) => void;
}) {
  const [made, setMade] = useState<string | null | undefined>(undefined);
  const [paper, setPaper] = useState(false);
  const [typed, setTyped] = useState('');
  const [again, setAgain] = useState('');
  const [wrong, setWrong] = useState(false);
  useEffect(() => {
    let shown = true;
    void parts.forms.nextRoeNumber().then((next) => {
      if (shown) setMade(next);
    });
    return () => {
      shown = false;
    };
  }, [parts.forms]);
  if (made === undefined) return null;

  if (paper || made === null) {
    const written = typed.trim();
    return frame(
      said.roeNumber.paperTitle,
      <>
        <Button
          main
          wide
          isDisabled={written === '' || again.trim() === ''}
          onPress={() => {
            if (again.trim() !== written) {
              setWrong(true);
              setAgain('');
              return;
            }
            begin({}, { number: written, from: 'TYPED' });
          }}
        >
          {said.roeNumber.open}
        </Button>
        {made === null ? null : (
          <Button
            wide
            onPress={() => {
              setPaper(false);
              setWrong(false);
            }}
          >
            {said.roeNumber.made}
          </Button>
        )}
      </>,
      <>
        {made === null ? (
          <Banner tone="notice">
            <p>{said.roeNumber.none}</p>
          </Banner>
        ) : null}
        {wrong ? (
          <Banner tone="problem" announced>
            <p>{said.roeNumber.wrong}</p>
          </Banner>
        ) : null}
        <TextEntry
          label={said.roeNumber.paperLabel}
          value={typed}
          onChange={setTyped}
          longest={numberLongest}
        />
        <TextEntry
          label={said.roeNumber.paperAgain}
          value={again}
          onChange={setAgain}
          longest={numberLongest}
        />
      </>,
    );
  }

  const digits = /^R-(\d+)$/.exec(made)?.[1] ?? '';
  return frame(
    said.roeNumber.againTitle,
    <>
      <Button
        main
        wide
        isDisabled={typed === ''}
        onPress={() => {
          if (Number(typed) !== Number(digits)) {
            setWrong(true);
            setTyped('');
            return;
          }
          begin({}, { number: made, from: 'MADE' });
        }}
      >
        {said.roeNumber.open}
      </Button>
      <Button
        wide
        onPress={() => {
          setPaper(true);
          setTyped('');
          setWrong(false);
        }}
      >
        {said.roeNumber.paper}
      </Button>
    </>,
    <>
      <dl className="facts">
        <dt>{said.roeNumber.shown}</dt>
        <dd className="big-number">{made}</dd>
      </dl>
      <p>{said.roeNumber.noteIt}</p>
      <TypeAgain titleId={titleId} number={made} value={typed} onChange={setTyped} wrong={wrong} />
    </>,
  );
}

// What a form's screens hold typed and not yet kept.
type Typed =
  | 'parcelId'
  | 'ownerName'
  | 'address'
  | 'signedDate'
  | 'roeNumber'
  | 'surveyNumber'
  | 'description'
  | 'parties'
  | 'certNumber'
  | 'residentName'
  | 'originAddress'
  | 'notes';

// A form being filled in: its steps as its kind and the project's forms have them, kept at once.
function FillForm({
  parts,
  form,
  held,
  assignment,
  standing,
  onPhoto,
  onSubmitted,
  onLeave,
  below,
}: {
  readonly parts: CaptureParts;
  readonly form: PhoneForm;
  readonly held: HeldLists;
  readonly assignment: PhoneAssignmentAnswer;
  readonly standing: Standing;
  readonly onPhoto: (photoId: string) => void;
  readonly onSubmitted: () => void;
  readonly onLeave: () => void;
  readonly below?: ReactNode;
}) {
  const titleId = useId();
  const { lists } = held;
  const [now, setNow] = useState(form);
  const fields = ownFieldsOf(now, held);
  const steps = stepsOf(now.kind, held, fields);
  const [step, setStep] = useState<FormStep>(
    steps.find((one) => one === form.step) ?? steps[0] ?? 'review',
  );
  const [typed, setTyped] = useState<Readonly<Record<Typed, string>>>(() => ({
    parcelId: form.parcelId ?? '',
    ownerName: form.ownerName ?? '',
    address: form.addressSource === 'LOOKED_UP' ? '' : (form.address ?? ''),
    signedDate: form.signedDate ?? '',
    roeNumber: form.kind === 'ROE' ? '' : (form.roeNumber ?? ''),
    surveyNumber: form.surveyNumber ?? '',
    description: form.description ?? '',
    parties: form.parties ?? '',
    certNumber: form.certNumber ?? '',
    residentName: form.residentName ?? '',
    originAddress: form.originAddress ?? '',
    notes: form.notes ?? '',
  }));
  const [signedOn, setSignedOn] = useState<'today' | 'before' | 'not' | null>(
    form.signed === null
      ? null
      : !form.signed
        ? 'not'
        : form.signedDate === form.day
          ? 'today'
          : 'before',
  );
  const [cancelling, setCancelling] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notKept, setNotKept] = useState<string | null>(null);
  const place = Math.max(0, steps.indexOf(step));
  const typing = (name: Typed) => (value: string) => {
    setTyped((before) => ({ ...before, [name]: value }));
  };
  const text = (name: Typed): string | null => {
    const value = typed[name].trim();
    return value === '' ? null : value;
  };

  // Kept at once, merged with what the phone holds now, never this screen's copy alone.
  const changed = async (change: Partial<FormDetails> & { readonly step?: string }) => {
    const next = await parts.forms.changed(now.id, change);
    setNow(next);
    return next;
  };
  const go = (to: FormStep | undefined) => {
    if (to === undefined) return;
    setStep(to);
    void changed({ step: to });
  };
  const onward = () => {
    go(steps[steps.indexOf(step) + 1]);
  };
  const back = () => {
    const before = steps[place - 1];
    if (before !== undefined) go(before);
  };
  const frame = (title: string, actions: ReactNode, children?: ReactNode) => (
    <FormScreen kind={now.kind} at="fill">
      <Step
        standing={standing}
        title={title}
        titleId={titleId}
        step={place + 1}
        steps={steps.length}
        onBack={place === 0 ? undefined : back}
        actions={
          <>
            {actions}
            <Button wide onPress={onLeave}>
              {words.capture.leave}
            </Button>
            <Button
              wide
              onPress={() => {
                setCancelling(true);
              }}
            >
              {said.cancel}
            </Button>
          </>
        }
      >
        {children}
      </Step>
      {below}
    </FormScreen>
  );
  const next = (enabled: boolean, onPress: () => void) => (
    <Button main wide isDisabled={!enabled} onPress={onPress}>
      {words.capture.next}
    </Button>
  );
  const photographed = async (bytes: Uint8Array): Promise<string | null> => {
    const where = await parts.locator.where();
    const id = await parts.forms.photographed(
      now.id,
      bytes,
      where.kind === 'fix' ? where.fix : null,
    );
    const after = parts.forms.form(now.id);
    if (after !== undefined) setNow(after);
    return id;
  };
  const photos = (
    <TicketPhotos
      tickets={parts.forms}
      ticket={now}
      atMost={ticketPhotosAtMost}
      onTaken={async (bytes) => (await photographed(bytes)) !== null}
      onOpen={(photo) => {
        onPhoto(photo.id);
      }}
    />
  );
  // An ROE picked from the phone's list, or typed: what a survey or an incident names.
  const roePick = (
    title: string,
    offered: readonly { roeNumber: string; address: string | null }[],
    about?: ReactNode,
  ) =>
    frame(
      title,
      next(true, () => {
        void changed({ roeNumber: text('roeNumber') }).then(onward);
      }),
      <>
        {about}
        {offered.length === 0 ? null : (
          <ListPicker
            labelledBy={titleId}
            choices={offered.map((roe) => ({
              key: roe.roeNumber,
              label: roe.roeNumber,
              detail: roe.address ?? words.capture.roe.noAddress,
            }))}
            picked={
              offered.some(({ roeNumber }) => roeNumber === typed.roeNumber)
                ? typed.roeNumber
                : null
            }
            onPick={typing('roeNumber')}
          />
        )}
        <TextEntry
          label={words.capture.roe.typeIt}
          value={typed.roeNumber}
          onChange={typing('roeNumber')}
          longest={numberLongest}
        />
      </>,
    );

  if (cancelling) {
    return (
      <main data-screen="cancel-form" className="screen">
        <StatusStrip standing={standing} />
        <div className="screen-body">
          <h1>{say(said.cancelTitle, { form: formTitle(now, held) })}</h1>
          <p>{now.kind === 'ROE' ? said.cancelAboutRoe : said.cancelAbout}</p>
        </div>
        <div className="screen-actions">
          <Button
            main
            wide
            onPress={() => {
              setCancelling(false);
            }}
          >
            {said.cancelNo}
          </Button>
          <Button
            wide
            onPress={() => {
              void parts.forms.cancel(now.id).then(onLeave);
            }}
          >
            {said.cancelYes}
          </Button>
        </div>
        {below}
      </main>
    );
  }

  switch (step) {
    case 'property':
      return frame(
        said.roe.propertyTitle,
        next(true, () => {
          void changed({
            parcelId: text('parcelId'),
            ownerName: text('ownerName'),
            ...(gpsRequired('ROE', held)
              ? {}
              : {
                  address: text('address'),
                  addressSource: text('address') === null ? null : 'TYPED',
                }),
          }).then(onward);
        }),
        <>
          <p>{formTitle(now, held)}</p>
          <TextEntry
            label={said.roe.parcel}
            value={typed.parcelId}
            onChange={typing('parcelId')}
            longest={wordsLongest}
          />
          <TextEntry
            label={said.roe.owner}
            value={typed.ownerName}
            onChange={typing('ownerName')}
            longest={wordsLongest}
          />
          {gpsRequired('ROE', held) ? null : (
            <TextEntry
              label={said.roe.address}
              value={typed.address}
              onChange={typing('address')}
              longest={wordsLongest}
            />
          )}
        </>,
      );
    case 'signed': {
      const day = typed.signedDate.trim();
      const isDay =
        /^\d{4}-\d{2}-\d{2}$/.test(day) &&
        !Number.isNaN(Date.parse(`${day}T00:00:00Z`)) &&
        new Date(`${day}T00:00:00Z`).toISOString().startsWith(day);
      return frame(
        said.roe.signedTitle,
        next(signedOn !== null && (signedOn !== 'before' || isDay), () => {
          const signed = signedOn !== 'not';
          const signedDate = signedOn === 'today' ? now.day : signedOn === 'before' ? day : null;
          void changed({ signed, signedDate }).then(onward);
        }),
        <>
          <ListPicker
            labelledBy={titleId}
            choices={[
              { key: 'today', label: said.roe.signedToday },
              { key: 'before', label: said.roe.signedBefore },
              { key: 'not', label: said.roe.notSigned },
            ]}
            picked={signedOn}
            onPick={(picked) => {
              setSignedOn(picked as 'today' | 'before' | 'not');
            }}
          />
          {signedOn === 'before' ? (
            <>
              <TextEntry
                label={said.roe.signedDay}
                value={typed.signedDate}
                onChange={typing('signedDate')}
                longest={10}
              />
              {day !== '' && !isDay ? <p role="status">{said.roe.notADay}</p> : null}
            </>
          ) : null}
        </>,
      );
    }
    case 'roe':
      if (now.kind === 'SURVEY') {
        const postWork =
          lists.surveyWorkTypes.find(({ id }) => id === now.workTypeId)?.key === 'POST_WORK';
        // The project's ROEs the lists hold, and those made on this phone the server hasn't told
        // it of yet.
        const roes = [
          ...lists.roes,
          ...parts.forms
            .roesHere(now.projectId)
            .filter(({ roeNumber }) => !lists.roes.some((roe) => roe.roeNumber === roeNumber)),
        ];
        const offered = postWork
          ? new PhoneSurveys(roes).postWork(parts.forms.preWorkHere(now.projectId, lists))
          : roes;
        return roePick(
          said.survey.roeTitle,
          offered,
          postWork ? (
            <p>{offered.length === 0 ? said.survey.postWorkNone : said.survey.postWorkAbout}</p>
          ) : null,
        );
      }
      return roePick(said.incident.roeTitle, lists.roes);
    case 'number':
      return frame(
        said.survey.numberTitle,
        <Button
          main
          wide
          onPress={() => {
            void changed({ surveyNumber: text('surveyNumber') }).then(onward);
          }}
        >
          {text('surveyNumber') === null ? said.survey.numberNone : words.capture.next}
        </Button>,
        <TextEntry
          label={said.survey.numberLabel}
          value={typed.surveyNumber}
          onChange={typing('surveyNumber')}
          longest={numberLongest}
        />,
      );
    case 'details':
      return frame(
        said.incident.detailsTitle,
        next(true, () => {
          void changed({ description: text('description'), parties: text('parties') }).then(onward);
        }),
        <>
          <p>{formTitle(now, held)}</p>
          <TextEntry
            label={said.incident.description}
            value={typed.description}
            onChange={typing('description')}
            longest={wordsLongest}
          />
          <TextEntry
            label={said.incident.parties}
            value={typed.parties}
            onChange={typing('parties')}
            longest={wordsLongest}
          />
        </>,
      );
    case 'contractor':
      return frame(
        said.incident.contractorTitle,
        <Button
          main
          wide
          onPress={() => {
            onward();
          }}
        >
          {now.contractorId === null ? said.incident.contractorNone : words.capture.next}
        </Button>,
        <ListPicker
          labelledBy={titleId}
          choices={lists.contractors.map(({ id, name }) => ({ key: id, label: name }))}
          picked={now.contractorId}
          onPick={(contractorId) => {
            void changed({ contractorId });
          }}
        />,
      );
    case 'cert':
      return frame(
        said.incident.certTitle,
        <Button
          main
          wide
          onPress={() => {
            void changed({ certNumber: text('certNumber') }).then(onward);
          }}
        >
          {text('certNumber') === null ? said.incident.certNone : words.capture.next}
        </Button>,
        <ScanField
          label={said.incident.certLabel}
          value={typed.certNumber}
          onChange={(value) => {
            typing('certNumber')(value.slice(0, numberLongest));
          }}
          onScan={() => {
            document.querySelector<HTMLInputElement>('.scan-field input')?.focus();
          }}
        />,
      );
    case 'resident':
      return frame(
        said.dropOff.residentTitle,
        next(true, () => {
          void changed({
            residentName: text('residentName'),
            originAddress: text('originAddress'),
          }).then(onward);
        }),
        <>
          <dl className="facts">
            <dt>{said.review.site}</dt>
            <dd>{assignment.site?.name ?? words.capture.review.none}</dd>
          </dl>
          <TextEntry
            label={said.dropOff.residentName}
            value={typed.residentName}
            onChange={typing('residentName')}
            longest={wordsLongest}
          />
          <TextEntry
            label={said.dropOff.origin}
            value={typed.originAddress}
            onChange={typing('originAddress')}
            longest={wordsLongest}
          />
        </>,
      );
    case 'place': {
      const withAddress = now.kind === 'ROE' || now.kind === 'INCIDENT';
      const title =
        now.kind === 'ROE'
          ? said.roe.placeTitle
          : now.kind === 'INCIDENT'
            ? said.incident.placeTitle
            : now.kind === 'DROP_OFF_LOG'
              ? said.dropOff.placeTitle
              : said.place.title;
      return frame(
        title,
        next(true, () => {
          void (
            withAddress ? changed(typedAddressChange(now, typed.address)) : Promise.resolve(now)
          ).then(onward);
        }),
        <>
          {now.kind === 'ROE' ? (
            <Banner tone="info">
              <p>{said.roe.gpsRequired}</p>
            </Banner>
          ) : null}
          {withAddress ? (
            <PlaceFields
              parts={parts}
              ticket={now}
              typed={typed.address}
              onTyped={typing('address')}
              onChanged={changed}
            />
          ) : (
            <FixOnly parts={parts} form={now} onChanged={changed} />
          )}
          {now.end === null ? <p className="quiet">{said.place.noFixSubmit}</p> : null}
        </>,
      );
    }
    case 'own':
      return (
        <OwnFields
          key={now.formDefinitionId}
          fields={fields}
          form={now}
          parts={parts}
          frame={frame}
          onAnswered={(answers) => changed({ answers }).then(onward)}
          onChanged={changed}
          onPhotographed={photographed}
          onPhoto={onPhoto}
        />
      );
    case 'photos':
      return frame(
        now.kind === 'ROE' ? said.roe.photoTitle : said.photosTitle,
        next(true, onward),
        photos,
      );
    case 'notes':
      return frame(
        said.notes.title,
        next(true, () => {
          void changed({ notes: text('notes') }).then(onward);
        }),
        <TextEntry
          label={said.notes.label}
          value={typed.notes}
          onChange={typing('notes')}
          longest={wordsLongest}
        />,
      );
    case 'review':
      return frame(
        said.review.title[now.kind],
        <Button
          main
          wide
          isDisabled={submitting}
          onPress={() => {
            setSubmitting(true);
            setNotKept(null);
            void (async () => {
              const placed = now.kind !== 'ROE' || gpsRequired('ROE', held);
              const end =
                now.end ??
                (placed
                  ? await parts.locator
                      .where()
                      .then((where) => (where.kind === 'fix' ? where.fix : null))
                  : null);
              const outcome = await parts.forms.submit(now.id, end);
              setSubmitting(false);
              if (outcome.kind === 'sealed') onSubmitted();
              else setNotKept(outcome.notice.message);
            })();
          }}
        >
          {submitting ? said.review.submitting : said.review.submit}
        </Button>,
        <>
          <p>{said.review.about}</p>
          {notKept === null ? null : (
            <Banner tone="problem" announced>
              <p>{say(said.review.notKept, { message: notKept })}</p>
            </Banner>
          )}
          <Reviewed form={now} held={held} assignment={assignment} fields={fields} />
          <h2>{said.review.photos}</h2>
          {now.photos.length === 0 ? <p>{said.review.none}</p> : photos}
        </>,
      );
  }
}

// The phone's fix alone, for a form that records no address: captured, or none.
function FixOnly({
  parts,
  form,
  onChanged,
}: {
  readonly parts: CaptureParts;
  readonly form: PhoneForm;
  readonly onChanged: (change: Partial<FormDetails>) => Promise<unknown>;
}) {
  const [fixing, setFixing] = useState(false);
  const [placed, setPlaced] = useState<'none' | 'refused' | null>(null);
  return (
    <>
      <Button
        wide
        isDisabled={fixing}
        onPress={() => {
          setFixing(true);
          void parts.locator.where().then(async (where) => {
            setFixing(false);
            if (where.kind === 'fix') {
              setPlaced(null);
              await onChanged({ end: where.fix });
            } else setPlaced(where.kind === 'refused' ? 'refused' : 'none');
          });
        }}
      >
        {fixing ? words.capture.place.capturing : words.capture.place.capture}
      </Button>
      {form.end === null ? null : (
        <p>
          {say(words.capture.place.fix, {
            latitude: form.end.latitude,
            longitude: form.end.longitude,
          })}
        </p>
      )}
      {placed === 'none' ? <p role="status">{words.capture.place.noFix}</p> : null}
      {placed === 'refused' ? (
        <Banner tone="notice" announced>
          <p>{words.capture.open.placeRefused}</p>
        </Banner>
      ) : null}
    </>
  );
}

type OwnField = ReturnType<typeof ownFieldsOf>[number];

// Answers with those left empty taken out.
const answered = (
  answers: Readonly<Record<string, OwnAnswer | undefined>>,
): Record<string, OwnAnswer> =>
  Object.fromEntries(
    Object.entries(answers).filter((entry): entry is [string, OwnAnswer] => entry[1] !== undefined),
  );

// The firm's own fields, each by its type: words typed, a number, yes or no, one of its choices,
// a photograph taken. A required one unanswered holds Next, but never a photograph's.
function OwnFields({
  fields,
  form,
  parts,
  frame,
  onAnswered,
  onChanged,
  onPhotographed,
  onPhoto,
}: {
  readonly fields: readonly OwnField[];
  readonly form: PhoneForm;
  readonly parts: CaptureParts;
  readonly frame: (title: string, actions: ReactNode, children?: ReactNode) => ReactNode;
  readonly onAnswered: (answers: Readonly<Record<string, OwnAnswer>>) => Promise<unknown>;
  readonly onChanged: (change: Partial<FormDetails>) => Promise<PhoneForm>;
  readonly onPhotographed: (bytes: Uint8Array) => Promise<string | null>;
  readonly onPhoto: (photoId: string) => void;
}) {
  const own = said.own;
  const [typed, setTyped] = useState<Readonly<Record<string, string>>>(() =>
    Object.fromEntries(
      fields
        .filter(({ type }) => type === 'TEXT' || type === 'NUMBER')
        .map(({ id }) => [id, form.answers[id] === undefined ? '' : String(form.answers[id])]),
    ),
  );
  const ids = useRef(new Map<string, string>());
  const baseId = useId();
  const labelId = (field: OwnField) => {
    const known = ids.current.get(field.id);
    if (known !== undefined) return known;
    const made = `${baseId}-${String(ids.current.size)}`;
    ids.current.set(field.id, made);
    return made;
  };
  const label = (field: OwnField) =>
    field.required && field.type !== 'PHOTO'
      ? say(own.required, { label: field.label })
      : field.label;

  // The answers as the phone holds them this moment, with some changed: never this screen's copy,
  // which a change still being kept may have moved past (a pick, then a photograph at once).
  const held = (change: Readonly<Record<string, OwnAnswer | undefined>>) =>
    answered({ ...(parts.forms.form(form.id)?.answers ?? form.answers), ...change });
  // What the screen holds now, each typed answer read as its type.
  const typedNow: Record<string, OwnAnswer | undefined> = {};
  const notNumbers: OwnField[] = [];
  for (const field of fields) {
    if (field.type !== 'TEXT' && field.type !== 'NUMBER') continue;
    const value = (typed[field.id] ?? '').trim();
    if (value !== '' && field.type === 'TEXT') typedNow[field.id] = value;
    else if (/^-?\d+(\.\d+)?$/.test(value)) typedNow[field.id] = Number(value);
    else typedNow[field.id] = undefined;
    if (value !== '' && field.type === 'NUMBER' && typedNow[field.id] === undefined) {
      notNumbers.push(field);
    }
  }
  const answers = answered({ ...form.answers, ...typedNow });
  const unanswered = unansweredOf([...fields], answers);
  const ready = unanswered.length === 0 && notNumbers.length === 0;

  return frame(
    own.title,
    <Button
      main
      wide
      isDisabled={!ready}
      onPress={() => {
        void onAnswered(held(typedNow));
      }}
    >
      {words.capture.next}
    </Button>,
    <>
      {unanswered.length === 0 ? null : (
        <p role="status">
          {say(own.needed, { fields: unanswered.map((field) => field.label).join(', ') })}
        </p>
      )}
      {notNumbers.map((field) => (
        <p key={field.id} role="status">
          {say(own.notANumber, { label: field.label })}
        </p>
      ))}
      {fields.map((field) => {
        switch (field.type) {
          case 'TEXT':
          case 'NUMBER':
            return (
              <TextEntry
                key={field.id}
                label={label(field)}
                value={typed[field.id] ?? ''}
                onChange={(value) => {
                  setTyped((before) => ({ ...before, [field.id]: value }));
                }}
                decimal={field.type === 'NUMBER'}
                longest={answerLongest}
              />
            );
          case 'YES_NO':
          case 'PICK': {
            const answer = form.answers[field.id];
            const choices =
              field.type === 'YES_NO'
                ? [
                    { key: 'yes', label: own.yes },
                    { key: 'no', label: own.no },
                  ]
                : (field.choices ?? []).map((choice) => ({ key: choice, label: choice }));
            const picked =
              field.type === 'YES_NO'
                ? answer === true
                  ? 'yes'
                  : answer === false
                    ? 'no'
                    : null
                : typeof answer === 'string'
                  ? answer
                  : null;
            return (
              <section key={field.id} className="field">
                <h2 id={labelId(field)} className="field-label">
                  {label(field)}
                </h2>
                <ListPicker
                  labelledBy={labelId(field)}
                  choices={choices}
                  picked={picked}
                  onPick={(key) => {
                    const value = field.type === 'YES_NO' ? key === 'yes' : key;
                    void onChanged({ answers: held({ [field.id]: value }) });
                  }}
                />
              </section>
            );
          }
          case 'PHOTO':
            return (
              <OwnPhoto
                key={field.id}
                field={field}
                label={label(field)}
                form={form}
                parts={parts}
                onTaken={async (bytes) => {
                  const before = held({})[field.id];
                  const id = await onPhotographed(bytes);
                  if (id === null) return false;
                  await onChanged({ answers: held({ [field.id]: id }) });
                  // The one it takes the place of goes, and the screen shows the form as kept.
                  if (typeof before === 'string') {
                    await parts.forms.photoRemoved(form.id, before);
                    await onChanged({});
                  }
                  return true;
                }}
                onOpen={onPhoto}
              />
            );
        }
      })}
    </>,
  );
}

// A photograph field: the one taken, shown and opened full size, or the way to take it.
function OwnPhoto({
  field,
  label,
  form,
  parts,
  onTaken,
  onOpen,
}: {
  readonly field: OwnField;
  readonly label: string;
  readonly form: PhoneForm;
  readonly parts: CaptureParts;
  readonly onTaken: (bytes: Uint8Array) => Promise<boolean>;
  readonly onOpen: (photoId: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [refused, setRefused] = useState(false);
  const answer = form.answers[field.id];
  const photo = form.photos.find(({ id }) => id === answer);
  const full = form.photos.length >= ticketPhotosAtMost;
  return (
    <section className="field">
      <h2 className="field-label">{label}</h2>
      {photo === undefined ? (
        <p>{said.own.photoNotTaken}</p>
      ) : (
        <Button
          wide
          onPress={() => {
            onOpen(photo.id);
          }}
        >
          <PhotoDrawn tickets={parts.forms} photo={photo} label={photoLabel(form, photo)} />
        </Button>
      )}
      {refused ? (
        <Banner tone="notice" announced>
          <p>{words.capture.photos.tooLarge}</p>
        </Banner>
      ) : null}
      <input
        ref={input}
        hidden
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(chosen) => {
          const file = chosen.currentTarget.files?.[0];
          chosen.currentTarget.value = '';
          if (file === undefined) return;
          void file
            .arrayBuffer()
            .then((bytes) => onTaken(new Uint8Array(bytes)))
            .then((kept) => {
              setRefused(!kept);
            });
        }}
      />
      <Button
        wide
        icon={<Camera />}
        isDisabled={full && photo === undefined}
        onPress={() => {
          input.current?.click();
        }}
      >
        {photo === undefined ? said.own.photo : said.own.retake}
      </Button>
    </section>
  );
}

// Everything a form holds, once, as its kind records it.
function Reviewed({
  form,
  held,
  assignment,
  fields,
}: {
  readonly form: PhoneForm;
  readonly held: HeldLists;
  readonly assignment: PhoneAssignmentAnswer;
  readonly fields: readonly OwnField[];
}) {
  const review = said.review;
  const { lists } = held;
  const shown = (value: string | null) => value ?? review.none;
  const named = (list: readonly { id: string; name: string }[], id: string | null) =>
    list.find((one) => one.id === id)?.name ?? review.none;
  const where =
    form.end === null
      ? null
      : say(words.capture.place.fix, {
          latitude: form.end.latitude,
          longitude: form.end.longitude,
        });
  const rows: [string, string][] = [];
  switch (form.kind) {
    case 'ROE':
      rows.push(
        [review.roeNumber, shown(form.roeNumber)],
        [review.parcel, shown(form.parcelId)],
        [review.owner, shown(form.ownerName)],
        [review.address, shown(form.address)],
        [
          review.signed,
          form.signed === true
            ? form.signedDate === null
              ? review.yes
              : say(review.signedOn, { day: form.signedDate })
            : review.notSigned,
        ],
      );
      if (gpsRequired('ROE', held)) rows.push([review.place, where ?? review.none]);
      break;
    case 'SURVEY':
      rows.push(
        [review.workType, named(lists.surveyWorkTypes, form.workTypeId)],
        [review.roe, shown(form.roeNumber)],
        [review.surveyNumber, shown(form.surveyNumber)],
        [review.place, where ?? review.none],
        [review.notes, shown(form.notes)],
      );
      break;
    case 'INCIDENT': {
      const type = lists.incidentTypes.find(({ id }) => id === form.incidentTypeId);
      const offers = lists.incidentOffers;
      rows.push(
        [
          review.type,
          type === undefined
            ? review.none
            : form.incidentSubTypeId === null
              ? type.name
              : `${type.name} · ${named(type.subTypes, form.incidentSubTypeId)}`,
        ],
        [review.description, shown(form.description)],
        [review.parties, shown(form.parties)],
      );
      if (offers.includes('CONTRACTOR')) {
        rows.push([review.contractor, named(lists.contractors, form.contractorId)]);
      }
      if (offers.includes('CERT_NUMBER')) rows.push([review.cert, shown(form.certNumber)]);
      if (offers.includes('ROE_NUMBER')) rows.push([review.roe, shown(form.roeNumber)]);
      rows.push(
        [review.place, form.address ?? where ?? review.none],
        [review.notes, shown(form.notes)],
      );
      break;
    }
    case 'DROP_OFF_LOG':
      rows.push(
        [review.site, assignment.site?.name ?? review.none],
        [review.resident, shown(form.residentName)],
        [review.origin, shown(form.originAddress)],
        [review.place, where ?? review.none],
        [review.notes, shown(form.notes)],
      );
      break;
  }
  for (const field of fields) {
    const answer = form.answers[field.id];
    rows.push([
      field.label,
      answer === undefined
        ? review.none
        : field.type === 'PHOTO'
          ? said.own.photoTaken
          : typeof answer === 'boolean'
            ? answer
              ? review.yes
              : review.no
            : String(answer),
    ]);
  }
  return (
    <dl className="facts">
      {rows.map(([term, value]) => (
        <Fragment key={term}>
          <dt>{term}</dt>
          <dd>{value}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

// When a form was begun, as home lists it.
export const formStarted = (form: PhoneForm): string =>
  say(words.home.open.started, { time: timeOfDay(new Date(form.madeAt), form.timeZone) });
