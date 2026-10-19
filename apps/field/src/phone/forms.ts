// The forms that are no ticket's, begun on the phone (adms-ticket-workflows §4.6; adms-field-app
// §4A.6; BACKLOG 3.5.4, C66, C67 (c), C69, C118, C127; REQ-307; AC-04-80, 83, 86…88, 99, 101,
// AC-11-84…87; ADR-149, 150, 160, 181, 184, 188, 215, 236, 328, 477, 571, 573, 584). What the form
// screens keep and read, in the store, so a form left at any step is there after a sign-out and
// a restart (ADR-570), as a ticket is (`PhoneTickets`).
//
// - **Records, never a ticket's field events** (ADR-236): an ROE, a survey, an incident or a
//   citizen drop-off log pairs with nothing and bills nothing. Each is begun by its monitor and
//   is theirs alone (*agent default*, as tickets are, ADR-581); several may be open at once.
// - **An ROE's number at New** (ADR-149, 323): the next of the phone's ROE block, written `R-0007`
//   and marked used in its block in the same piece of work, so it is never made again; or the
//   paper's own, typed. Either is typed again by the screen before the ROE opens, a person having
//   copied it (the user, Q-218, ADR-573).
// - **The firm's own fields** (ADR-160, 278; C69): answered against the newest version the lists
//   held when the form was begun, kept with that version's id; a photograph field's answer is
//   the id of a photograph of the form's own.
// - **Nothing open is sent.** Submitted, it is made the record the sync contract carries and
//   handed to the outbox, **sealed** (the user, ADR-477): no screen opens it again, and nothing a
//   monitor did on it after their shift changes it (C66); the back office corrects it. Its
//   photographs follow it, each with its file. Cancelled, it stays on the phone, unsent, an ROE
//   keeping its number.
//
// No rule lives here that the server doesn't hold too: what each record takes is the contract's
// own refusal at `PhoneOutbox.keep`, which answers before anything is sealed.
import type { PhoneListsRecord, SyncedPhoto, SyncedRecord } from '@open-adms/contracts';
import {
  NumberSeriesRules,
  PhoneNumbers,
  ProjectClock,
  ticketPhotosAtMost,
  uuidv7,
  type AssignmentFormDocumentType,
  type NotSavedNotice,
} from '@open-adms/domain';

import type { Change, Json, PhoneStore } from '../store/phone-store.ts';
import type { PhoneLists } from './lists.ts';
import type { PhoneOutbox } from './outbox.ts';
import { offsetOf } from './reports.ts';
import type { Fix, TicketPhoto } from './tickets.ts';

export type FormKind = AssignmentFormDocumentType;
export type FormState = 'OPEN' | 'SUBMITTING' | 'SUBMITTED' | 'CANCELLED';
// An answer to one of the firm's own fields: text, a number, yes or no, a pick, or the id of a
// photograph of the form's.
export type OwnAnswer = string | number | boolean;

// What a form's monitor entered, each as picked or typed; null where nothing was.
export interface FormDetails {
  // An ROE's own number; the ROE a survey or an incident names, as picked or typed.
  readonly roeNumber: string | null;
  // An ROE's parcel, owner, whether it is signed and the day it was.
  readonly parcelId: string | null;
  readonly ownerName: string | null;
  readonly signed: boolean | null;
  readonly signedDate: string | null;
  // A survey's work type, and its number as written on the property's paper.
  readonly workTypeId: string | null;
  readonly surveyNumber: string | null;
  // An incident's type and sub-type, what happened, who was involved, and what its form offers:
  // the contractor involved, a cert number scanned or typed.
  readonly incidentTypeId: string | null;
  readonly incidentSubTypeId: string | null;
  readonly description: string | null;
  readonly parties: string | null;
  readonly contractorId: string | null;
  readonly certNumber: string | null;
  // A drop-off: the resident's name and where the debris came from.
  readonly residentName: string | null;
  readonly originAddress: string | null;
  // Where it was: the phone's fix, and an ROE's or an incident's address, looked up or typed.
  readonly end: Fix | null;
  readonly address: string | null;
  readonly addressSource: 'LOOKED_UP' | 'TYPED' | null;
  readonly notes: string | null;
  readonly answers: Readonly<Record<string, OwnAnswer>>;
}

export interface PhoneForm extends FormDetails {
  readonly id: string;
  readonly state: FormState;
  readonly kind: FormKind;
  readonly monitorId: string;
  readonly projectId: string;
  readonly timeZone: string;
  readonly assignmentId: string;
  readonly setupVersion: number;
  // The assignment's site: where a drop-off log is made.
  readonly siteId: string | null;
  // The version of the firm's own fields shown when it was begun; none where the form has none.
  readonly formDefinitionId: string | null;
  // Where an ROE's number came from: the phone's block, or the paper's.
  readonly numberFrom: 'MADE' | 'TYPED' | null;
  // When it was begun: its time (ADR-327), and the project's day.
  readonly madeAt: string;
  readonly offset: number;
  readonly day: string;
  // Where its monitor left it: the screen's own name for the step.
  readonly step: string;
  readonly photos: readonly TicketPhoto[];
  readonly closedAt: string | null;
  readonly closedDay: string | null;
}

// What New hands over: who, on what, and what the start picked.
export interface FormBegun {
  readonly kind: FormKind;
  readonly monitorId: string;
  readonly projectId: string;
  readonly timeZone: string;
  readonly assignmentId: string;
  readonly setupVersion: number;
  readonly siteId: string | null;
  readonly formDefinitionId: string | null;
  readonly step: string;
  readonly start?: Partial<FormDetails>;
  // An ROE's number: the one the phone made, or the paper's typed.
  readonly roe?: { readonly number: string; readonly from: 'MADE' | 'TYPED' };
}

// An ROE made on this phone, as a survey offers it.
export interface OfferedHere {
  readonly roeNumber: string;
  readonly address: string | null;
  readonly preWorkSurveyDone: false;
}

export interface FormsOptions {
  // The most bytes one photograph's file may be (`MEDIA_FILE_BYTES_AT_MOST`).
  readonly photoBytesAtMost: number;
  readonly now?: () => Date;
}

export type FormSubmitted =
  | { readonly kind: 'sealed'; readonly form: PhoneForm }
  | { readonly kind: 'notKept'; readonly notice: NotSavedNotice };

const formsShelf = 'forms';
const photoPrefix = 'photo:';

const hex = (bytes: ArrayBuffer): string =>
  Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');

const isForm = (value: unknown): value is PhoneForm =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  !(value instanceof Uint8Array) &&
  typeof (value as { id?: unknown }).id === 'string' &&
  typeof (value as { kind?: unknown }).kind === 'string';

const none: FormDetails = {
  roeNumber: null,
  parcelId: null,
  ownerName: null,
  signed: null,
  signedDate: null,
  workTypeId: null,
  surveyNumber: null,
  incidentTypeId: null,
  incidentSubTypeId: null,
  description: null,
  parties: null,
  contractorId: null,
  certNumber: null,
  residentName: null,
  originAddress: null,
  end: null,
  address: null,
  addressSource: null,
  notes: null,
  answers: {},
};

export class PhoneForms {
  private readonly store: PhoneStore;
  private readonly lists: PhoneLists;
  private readonly outbox: PhoneOutbox;
  private readonly options: FormsOptions;
  private readonly now: () => Date;
  private forms: PhoneForm[] = [];

  private constructor(
    store: PhoneStore,
    lists: PhoneLists,
    outbox: PhoneOutbox,
    options: FormsOptions,
  ) {
    this.store = store;
    this.lists = lists;
    this.outbox = outbox;
    this.options = options;
    this.now = options.now ?? (() => new Date());
  }

  // The forms as the store holds them; a form the phone stopped submitting finishes now.
  static async opened(
    store: PhoneStore,
    lists: PhoneLists,
    outbox: PhoneOutbox,
    options: FormsOptions,
  ): Promise<PhoneForms> {
    const forms = new PhoneForms(store, lists, outbox, options);
    await forms.read();
    for (const form of [...forms.forms]) {
      const submitting =
        form.state === 'SUBMITTING' ||
        (form.state === 'OPEN' && (await store.read('records', form.id)) !== undefined);
      if (submitting) await forms.sealed(form);
    }
    return forms;
  }

  async read(): Promise<void> {
    const kept = await this.store.readAll(formsShelf);
    const forms: PhoneForm[] = [];
    for (const { value } of kept) if (isForm(value)) forms.push(value);
    this.forms = forms.sort((one, other) => one.madeAt.localeCompare(other.madeAt));
  }

  // A monitor's open forms, the oldest first: home's open list.
  openOf(monitorId: string): readonly PhoneForm[] {
    return this.forms.filter((form) => form.monitorId === monitorId && form.state === 'OPEN');
  }

  form(id: string): PhoneForm | undefined {
    return this.forms.find((form) => form.id === id);
  }

  // The next ROE number the phone would make, written R-0007; none where it holds no ROE block or
  // has used it up.
  async nextRoeNumber(): Promise<string | null> {
    const held = await this.lists.held();
    if (held === undefined) return null;
    const next = new PhoneNumbers(
      held.lists.blocks.filter(({ series }) => series === 'ROE'),
    ).next();
    return next === null ? null : new NumberSeriesRules('ROE').written(next);
  }

  // The ROE numbers of the pre-work surveys submitted on this phone for a project: a post-work
  // survey offers their ROEs before the server has told the phone of them (ADR-150).
  preWorkHere(projectId: string, lists: PhoneListsRecord): readonly (string | null)[] {
    const preWork = new Set(
      lists.surveyWorkTypes.filter(({ key }) => key === 'PRE_WORK').map(({ id }) => id),
    );
    return this.forms
      .filter(
        (form) =>
          form.kind === 'SURVEY' &&
          form.projectId === projectId &&
          form.state === 'SUBMITTED' &&
          form.workTypeId !== null &&
          preWork.has(form.workTypeId),
      )
      .map((form) => form.roeNumber);
  }

  // The ROEs submitted on this phone for a project, by number and address, the oldest first: a
  // survey offers them before the server has told the phone of them. Whether a pre-work survey is
  // done is `preWorkHere`'s to say.
  roesHere(projectId: string): readonly OfferedHere[] {
    return this.forms
      .filter(
        (form) =>
          form.kind === 'ROE' &&
          form.projectId === projectId &&
          form.state === 'SUBMITTED' &&
          form.roeNumber !== null,
      )
      .map((form) => ({
        roeNumber: form.roeNumber ?? '',
        address: form.address,
        preWorkSurveyDone: false,
      }));
  }

  // New: a form opened with what its start picked. An ROE number the phone made is marked used in
  // its block in the same piece of work.
  async begin(begun: FormBegun): Promise<PhoneForm> {
    const at = this.now();
    const form: PhoneForm = {
      ...none,
      ...begun.start,
      roeNumber: begun.roe?.number ?? begun.start?.roeNumber ?? null,
      id: uuidv7(at),
      state: 'OPEN',
      kind: begun.kind,
      monitorId: begun.monitorId,
      projectId: begun.projectId,
      timeZone: begun.timeZone,
      assignmentId: begun.assignmentId,
      setupVersion: begun.setupVersion,
      siteId: begun.siteId,
      formDefinitionId: begun.formDefinitionId,
      numberFrom: begun.roe?.from ?? null,
      madeAt: at.toISOString(),
      offset: offsetOf(at),
      day: new ProjectClock(begun.timeZone).day(at),
      step: begun.step,
      photos: [],
      closedAt: null,
      closedDay: null,
    };
    const changes: Change[] = [this.kept(form)];
    if (begun.roe?.from === 'MADE') {
      const made = /^R-(\d+)$/.exec(begun.roe.number);
      const used = made === null ? null : await this.lists.gaveOut('ROE', Number(made[1]));
      if (used !== null) changes.push(used);
    }
    await this.store.change(changes);
    this.forms.push(form);
    return form;
  }

  // What its monitor entered, or where they left it: kept at once. Never a sealed form's.
  async changed(
    id: string,
    change: Partial<FormDetails> & { readonly step?: string },
  ): Promise<PhoneForm> {
    const form = this.openForm(id);
    return this.put({ ...form, ...change });
  }

  // A photograph taken while the form is open, at most its eight (ADR-157, 188): fingerprinted
  // now, its bytes kept beside the form. One too large to ever go is not kept. The photograph's
  // id, where it was kept: a photograph field's answer.
  async photographed(id: string, bytes: Uint8Array, fix: Fix | null): Promise<string | null> {
    const form = this.openForm(id);
    if (form.photos.length >= ticketPhotosAtMost) return null;
    if (bytes.byteLength === 0 || bytes.byteLength > this.options.photoBytesAtMost) return null;
    const at = this.now();
    const sha256 = hex(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes)));
    const photo: TicketPhoto = {
      id: uuidv7(at),
      capturedAt: at.toISOString(),
      offset: offsetOf(at),
      fix,
      sha256,
      bytes: bytes.byteLength,
      kept: false,
    };
    const next: PhoneForm = { ...this.openForm(id), photos: [...form.photos, photo] };
    await this.store.change([
      { shelf: formsShelf, id: `${photoPrefix}${photo.id}`, value: bytes },
      this.kept(next),
    ]);
    this.replace(next);
    return photo.id;
  }

  // A photograph taken off before submitting: never sent, and no field's answer any more.
  async photoRemoved(id: string, photoId: string): Promise<PhoneForm> {
    const form = this.openForm(id);
    const next: PhoneForm = {
      ...form,
      photos: form.photos.filter((photo) => photo.id !== photoId),
      answers: Object.fromEntries(
        Object.entries(form.answers).filter(([, answer]) => answer !== photoId),
      ),
    };
    await this.store.change([
      { shelf: formsShelf, id: `${photoPrefix}${photoId}`, dropped: true },
      this.kept(next),
    ]);
    this.replace(next);
    return next;
  }

  // A photograph's file as it was taken, for the screen to draw.
  async photoBytes(photoId: string): Promise<Uint8Array | undefined> {
    const kept = await this.store.read(formsShelf, `${photoPrefix}${photoId}`);
    return kept instanceof Uint8Array ? kept : undefined;
  }

  // Cancelled: kept on the phone, never sent; an ROE keeps its number (ADR-056).
  async cancel(id: string): Promise<PhoneForm> {
    const form = this.openForm(id);
    const at = this.now();
    return this.put({
      ...form,
      state: 'CANCELLED',
      closedAt: at.toISOString(),
      closedDay: new ProjectClock(form.timeZone).day(at),
    });
  }

  // Submitted: the record made from the form and sealed in the outbox, then its photographs, each
  // with its file. Where the contract doesn't take the record, nothing is sealed and the form
  // stays open, the contract's words said.
  async submit(id: string, end: Fix | null): Promise<FormSubmitted> {
    const form = this.openForm(id);
    const at = this.now();
    const submitting: PhoneForm = {
      ...form,
      end: form.end ?? end,
      state: 'SUBMITTING',
      closedAt: at.toISOString(),
      closedDay: new ProjectClock(form.timeZone).day(at),
    };
    const notice = await this.outbox.keep(PhoneForms.record(submitting));
    if (notice !== undefined) return { kind: 'notKept', notice };
    await this.put(submitting);
    return { kind: 'sealed', form: await this.sealed(submitting) };
  }

  // The record a form is, as the sync contract carries it: what its kind records, nothing more.
  static record(form: PhoneForm): SyncedRecord {
    const answered =
      form.formDefinitionId === null
        ? {}
        : { formDefinitionId: form.formDefinitionId, answers: { ...form.answers } };
    const made = {
      id: form.id,
      projectId: form.projectId,
      monitorId: form.monitorId,
      assignmentId: form.assignmentId,
      setupVersion: form.setupVersion,
      madeAt: form.madeAt,
      deviceUtcOffsetMinutes: form.offset,
      latitude: form.end?.latitude ?? null,
      longitude: form.end?.longitude ?? null,
      notes: form.notes,
      ...answered,
    };
    switch (form.kind) {
      case 'ROE':
        return {
          record: 'ROE',
          roe: {
            id: form.id,
            projectId: form.projectId,
            roeNumber: form.roeNumber ?? '',
            parcelId: form.parcelId,
            address: form.address,
            ownerName: form.ownerName,
            signed: form.signed === true,
            signedDate: form.signed === true ? form.signedDate : null,
            latitude: form.end?.latitude ?? null,
            longitude: form.end?.longitude ?? null,
            madeById: form.monitorId,
            assignmentId: form.assignmentId,
            madeAt: form.madeAt,
            deviceUtcOffsetMinutes: form.offset,
            ...answered,
          },
        };
      case 'SURVEY':
        return {
          record: 'SURVEY',
          survey: {
            ...made,
            workTypeId: form.workTypeId ?? '',
            surveyNumber: form.surveyNumber,
            roeNumber: form.roeNumber,
          },
        };
      case 'INCIDENT':
        return {
          record: 'INCIDENT',
          incident: {
            ...made,
            incidentTypeId: form.incidentTypeId ?? '',
            incidentSubTypeId: form.incidentSubTypeId,
            description: form.description,
            parties: form.parties,
            address: form.address,
            contractorId: form.contractorId,
            certNumber: form.certNumber,
            roeNumber: form.roeNumber,
          },
        };
      case 'DROP_OFF_LOG':
        return {
          record: 'DROP_OFF_LOG',
          dropOffLog: {
            ...made,
            siteId: form.siteId ?? '',
            residentName: form.residentName,
            originAddress: form.originAddress,
          },
        };
    }
  }

  // The photographs of a form submitting go to the outbox, each once with its file, its bytes
  // then dropped from beside the form; then the form is submitted. A form opened again half way
  // through finishes here: its record already sealed is left as it is.
  private async sealed(form: PhoneForm): Promise<PhoneForm> {
    if ((await this.store.read('records', form.id)) === undefined) {
      await this.outbox.keep(PhoneForms.record(form));
    }
    let now = form;
    for (const photo of form.photos.filter(({ kept }) => !kept)) {
      const bytes = await this.photoBytes(photo.id);
      if (bytes !== undefined) {
        const record: SyncedPhoto = {
          id: photo.id,
          projectId: form.projectId,
          owner: { kind: form.kind, id: form.id },
          view: null,
          takenById: form.monitorId,
          capturedAt: photo.capturedAt,
          deviceUtcOffsetMinutes: photo.offset,
          latitude: photo.fix?.latitude ?? null,
          longitude: photo.fix?.longitude ?? null,
          originalSha256: photo.sha256,
          uploadedSha256: photo.sha256,
          depthSha256: null,
        };
        await this.outbox.keepPhoto(record, [{ file: 'photo', bytes }]);
      }
      now = {
        ...now,
        photos: now.photos.map((one) => (one.id === photo.id ? { ...one, kept: true } : one)),
      };
      await this.store.change([
        { shelf: formsShelf, id: `${photoPrefix}${photo.id}`, dropped: true },
        this.kept(now),
      ]);
      this.replace(now);
    }
    return this.put({ ...now, state: 'SUBMITTED' });
  }

  private openForm(id: string): PhoneForm {
    const form = this.form(id);
    if (form?.state !== 'OPEN') throw new Error('Only an open form changes on the phone.');
    return form;
  }

  private kept(form: PhoneForm): Change {
    return { shelf: formsShelf, id: form.id, value: form as unknown as Json };
  }

  private async put(form: PhoneForm): Promise<PhoneForm> {
    await this.store.change([this.kept(form)]);
    this.replace(form);
    return form;
  }

  private replace(form: PhoneForm): void {
    const at = this.forms.findIndex(({ id }) => id === form.id);
    if (at === -1) this.forms.push(form);
    else this.forms[at] = form;
  }
}
