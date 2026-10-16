// A photograph added in the back office, to a record made there (ARCHITECTURE §6 "Uploads", §11;
// spec/THREAT-MODEL.md T-25; spec/DATA-MODEL.md §4.4; BACKLOG 2.8.7; ADR-101, 329, 482, 521,
// 534 (2)). A phone failed, the record was entered from paper, and its photographs (a
// certification's five views, an ROE's signed page) reach the store from the back office.
//
// What OWASP ASVS 5.0 V5 asks of a file a caller sends, met as the media endpoint meets it: the
// size bounded before it is read (the route's own limit, the policy's file size); its kind told
// by its own first bytes, never by a name or a type sent with it (the domain's
// `photoFileTypeOf`); kept where the server places it, once, never overwritten, outside anything
// served as a page. **Nobody fingerprinted it at capture**, so both of its fingerprints are the
// server's own reading of the bytes that arrived (ADR-101 asks that the one can be shown to come
// from the other: here they are the same).
//
// - **Only onto a record made in the back office** (a field event, a certification, an ROE, a
//   survey, an incident or a drop-off log): a phone's record keeps its own phone's photographs.
// - **A view is a certification's photograph's alone**, one of the five, or none.
// - **Who may**: a person who may correct records, asked before the file is kept and again in
//   the piece of work that writes its record; a ticket locked as invoiced refuses it.
// - **The file is kept first**, at the place made from the photograph's new id, then its record
//   and its upload time are written in one piece of work as the person: a piece of work never
//   waits on the store (`DATABASE_WORK_LONGEST_MS`). One whose record then fails is a file at a
//   place nothing names, never read.
// - It queues what it moves: a field event's ticket; a certification's own flags.
import { createHash } from 'node:crypto';

import { backOfficePhotographOwners } from '@open-adms/contracts';

import type { Database, Photo, PhotoView } from '@open-adms/db';
import {
  BackOfficePhotograph,
  photoFileSignatureBytes,
  photoFileTypeOf,
  type Policy,
} from '@open-adms/domain';

import { Refusal } from '../process/refusal.ts';
import { type Clock, type Outcome, Refused } from '../setup/setup-service.ts';
import {
  ReviewService,
  type Reviewed,
  type TicketNamed,
  ticketOf,
  type Tx,
} from '../review/review-service.ts';
import type { Media } from './media-store.ts';
import { photoPlaces } from './photo-places.ts';

export const apiBackOfficePhotographs = Symbol('the back office’s photographs');

// What a photograph added in the back office is on: the contract's list.
export type BackOfficePhotographOwner = (typeof backOfficePhotographOwners)[number];

export interface BackOfficePhotographSent {
  readonly on: BackOfficePhotographOwner;
  readonly recordId: string;
  readonly view: PhotoView | null;
  // When it was taken, by the person's word, and how far that clock stood from UTC.
  readonly capturedAt: Date;
  readonly utcOffsetMinutes: number;
  readonly bytes: Uint8Array;
}

const sha256Of = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

// The record a photograph goes on, as this service reads it.
interface Owner {
  readonly projectId: string;
  readonly madeInTheBackOffice: boolean;
  readonly tickets: readonly TicketNamed[];
  readonly projectRecords: boolean;
}

const inWords: Record<BackOfficePhotographOwner, string> = {
  FIELD_EVENT: 'field event',
  CERTIFICATION: 'certification',
  ROE: 'ROE',
  SURVEY: 'survey',
  INCIDENT: 'incident',
  DROP_OFF_LOG: 'drop-off log',
};

const ownerColumn = {
  FIELD_EVENT: 'fieldEventId',
  CERTIFICATION: 'certificationId',
  ROE: 'roeId',
  SURVEY: 'surveyId',
  INCIDENT: 'incidentId',
  DROP_OFF_LOG: 'dropOffLogId',
} as const satisfies Record<BackOfficePhotographOwner, keyof Photo>;

export class BackOfficePhotographs extends ReviewService {
  private readonly media: Media;
  private readonly fileBytesAtMost: number;

  constructor(
    db: Database,
    clock: Clock,
    policy: Policy,
    parts: { readonly media: Media; readonly fileBytesAtMost: number },
  ) {
    super(db, clock, policy);
    this.media = parts.media;
    this.fileBytesAtMost = parts.fileBytesAtMost;
  }

  async add(person: string, sent: BackOfficePhotographSent): Promise<Outcome<Reviewed<Photo>>> {
    const { bytes } = sent;
    if (bytes.byteLength > this.fileBytesAtMost) {
      throw new Refusal(
        'TOO_LARGE',
        413,
        `Not taken: a photograph’s file is at most ${String(this.fileBytesAtMost)} bytes.`,
      );
    }
    const type = photoFileTypeOf(bytes.subarray(0, photoFileSignatureBytes));
    if (type === null) {
      throw new Refusal(
        'UNSUPPORTED_MEDIA_TYPE',
        415,
        'Not taken: a photograph’s file is a JPEG, HEIC or HEIF, PNG or TIFF image.',
      );
    }
    // Asked before anything is kept: who may, and that the record takes one. Asked again in
    // the piece of work that writes its record.
    const asked = await this.db.$read(async (tx) => {
      const refusal = await this.refusalOf(tx, person, sent);
      if (refusal !== null) return { refusal };
      const [made] = await tx.$queryRaw<{ id: string }[]>`SELECT uuidv7()::text AS id`;
      if (made === undefined) throw new Error('The database made no id.');
      const owner = await BackOfficePhotographs.ownerOf(tx, sent.on, sent.recordId);
      return { id: made.id, projectId: owner.projectId };
    });
    if ('refusal' in asked) return { saved: false, refusal: asked.refusal };
    const { objectKey } = photoPlaces(asked.projectId, asked.id, false);
    if ((await this.media.keep(objectKey, bytes, type)) === 'ALREADY_THERE') {
      throw new Error('The store holds a file where a new photograph’s was to be kept.');
    }
    const sha256 = sha256Of(bytes);
    return this.review(person, 'CORRECT', undefined, async (tx) => {
      const refusal = await this.refusalOf(tx, person, sent);
      if (refusal !== null) throw new Refused(refusal);
      const owner = await BackOfficePhotographs.ownerOf(tx, sent.on, sent.recordId);
      await tx.photo.create({
        data: {
          id: asked.id,
          projectId: owner.projectId,
          [ownerColumn[sent.on]]: sent.recordId,
          view: sent.view,
          capturedAt: sent.capturedAt,
          deviceUtcOffsetMinutes: sent.utcOffsetMinutes,
          receivedAt: this.clock.now(),
          originalSha256: sha256,
          uploadedSha256: sha256,
          objectKey,
        },
      });
      // Its file is kept already: the time it reached the store, written once, by the person.
      const record = await tx.photo.update({
        where: { id: asked.id },
        data: { uploadedAt: this.clock.now() },
      });
      return {
        record,
        projectId: owner.projectId,
        tickets: owner.tickets,
        projectRecords: owner.projectRecords,
      };
    });
  }

  // Why the person may not add it there, or nothing.
  private async refusalOf(
    tx: Tx,
    person: string,
    sent: BackOfficePhotographSent,
  ): Promise<{ code: string; message: string } | null> {
    try {
      await ReviewService.permitted(tx, person, 'CORRECT');
    } catch (error) {
      if (error instanceof Refused) return error.refusal;
      throw error;
    }
    const owner = await BackOfficePhotographs.ownerOf(tx, sent.on, sent.recordId);
    if (!owner.madeInTheBackOffice) {
      return BackOfficePhotograph.notMadeInTheBackOffice(inWords[sent.on]);
    }
    if (sent.view !== null && sent.on !== 'CERTIFICATION') {
      return BackOfficePhotograph.viewOnlyOnACertification();
    }
    return null;
  }

  // The record by its kind and id; one there is none of is not found.
  private static async ownerOf(tx: Tx, on: BackOfficePhotographOwner, id: string): Promise<Owner> {
    const none = (): never => {
      throw new Refusal('NOT_FOUND', 404);
    };
    const formOwner = (
      record: { projectId: string; source: string } | null,
      projectRecords = false,
    ): Owner =>
      record === null
        ? none()
        : {
            projectId: record.projectId,
            madeInTheBackOffice: record.source === 'BACK_OFFICE',
            tickets: [],
            projectRecords,
          };
    switch (on) {
      case 'FIELD_EVENT': {
        const event = await tx.fieldEvent.findUnique({ where: { id } });
        if (event === null) return none();
        return {
          projectId: event.projectId,
          madeInTheBackOffice: event.source === 'BACK_OFFICE',
          tickets: [ticketOf(event)],
          projectRecords: false,
        };
      }
      case 'CERTIFICATION': {
        const certification = await tx.certification.findUnique({ where: { id } });
        if (certification === null) return none();
        // Its own flags (a view missing) are the run's for the project's records.
        return {
          projectId: certification.projectId,
          madeInTheBackOffice: certification.createdById !== null,
          tickets: [],
          projectRecords: true,
        };
      }
      case 'ROE':
        return formOwner(await tx.roe.findUnique({ where: { id } }));
      case 'SURVEY':
        return formOwner(await tx.survey.findUnique({ where: { id } }), true);
      case 'INCIDENT':
        return formOwner(await tx.incident.findUnique({ where: { id } }));
      case 'DROP_OFF_LOG':
        return formOwner(await tx.dropOffLog.findUnique({ where: { id } }));
    }
  }
}
