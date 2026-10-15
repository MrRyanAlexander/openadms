// The endpoints of what a sync held for a person and of what waits in quarantine (spec/parts/
// 05-sync.md step 6; spec/parts/08-review-and-corrections.md, "One review queue"; AC-05-46;
// AC-10-73…76; BACKLOG 2.8.4; ADR-468, 482, 526). The door has already asked the caller's role
// and, for a resolution, that they hold its permission (correct to save, void to close); each
// service asks again inside its own piece of work. A file set aside is handed back as a
// photograph's file is: the bytes stored, the type they said, a download never run as a page
// (ASVS V3.2.1, V5.4). The log says what was done or why not, by code and id: never what was
// sent, a note or a fingerprint.
import {
  heldSentAs,
  closeHeldRecordEndpoint,
  closeSetAsideFileEndpoint,
  heldRecordsAnswerSchema,
  listHeldRecordsEndpoint,
  listQuarantinedRecordsEndpoint,
  listSetAsideFilesEndpoint,
  quarantinedRecordsAnswerSchema,
  saveHeldRecordEndpoint,
  setAsideFileEndpoint,
  setAsideFilesAnswerSchema,
  type BodyOf,
  type HeldRecordAnswer,
  type HeldRecordsAnswer,
  type ParamsOf,
  type QuarantinedRecordsAnswer,
  type QueryOf,
  type SetAsideFileAnswer,
  type SetAsideFilesAnswer,
  type WaitingQuarantinedRecord,
} from '@open-adms/contracts';
import type { SetAsideFile } from '@open-adms/db';
import type { PhotoFileType } from '@open-adms/domain';
import { Body, Controller, Inject, Param, Query, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { fileAnswerPolicy } from '../media/photograph-files.controller.ts';
import { apiPhotographFiles, PhotographFiles } from '../media/photograph-files.ts';
import { Serves } from '../process/serves.ts';
import { callerOf } from '../sign-in/admission.ts';
import {
  HeldReads,
  type QuarantinedShown,
  type SetAsideShown,
  type WaitingAsked,
} from './held-reads.ts';
import { HeldReview, type HeldShown } from './held-review.ts';
import { fieldEventRecord, reviewed, roeRecord } from './review-answered.ts';

export const apiHeldReview = Symbol('the API’s resolution of what a sync held');
export const apiHeldReads = Symbol('the API’s reads of what waits for a person');

// A page's size where the request names none.
const pageOf = 50;

const time = (at: Date | null): string | null => at?.toISOString() ?? null;

const extensions: Record<PhotoFileType, string> = {
  'image/jpeg': 'jpg',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/png': 'png',
  'image/tiff': 'tif',
};

export const heldRecordShown = ({ held, photos }: HeldShown): HeldRecordAnswer => ({
  id: held.id,
  deviceId: held.deviceId,
  syncId: held.syncId,
  sentId: held.sentId,
  projectId: held.projectId,
  sentMonitorId: held.sentMonitorId,
  sentAs: heldSentAs(held.payload, held.reason),
  sent: held.payload as HeldRecordAnswer['sent'],
  reason: held.reason,
  message: held.message,
  receivedAt: held.receivedAt.toISOString(),
  photos: [...photos],
  resolvedById: held.resolvedById,
  resolvedAt: time(held.resolvedAt),
  resolution: held.resolution,
});

const resolution = (file: SetAsideFile) => ({
  resolvedById: file.resolvedById,
  resolvedAt: time(file.resolvedAt),
  resolution: file.resolution,
});

const fileFields = (file: SetAsideFile) => ({
  id: file.id,
  photoId: file.photoId,
  file: file.file === 'PHOTO' ? ('photo' as const) : ('depth' as const),
  deviceId: file.deviceId,
  receivedSha256: file.receivedSha256,
  byteCount: file.byteCount,
  contentType: file.contentType,
  receivedAt: file.receivedAt.toISOString(),
});

const setAsideShown = ({ file, photo }: SetAsideShown): SetAsideFileAnswer =>
  ({
    ...fileFields(file),
    photograph: photo,
    ...resolution(file),
  }) as SetAsideFileAnswer;

const quarantinedShown = ({ kept, holder }: QuarantinedShown): WaitingQuarantinedRecord => ({
  id: kept.id,
  projectId: kept.projectId,
  deviceId: kept.deviceId,
  monitorId: kept.monitorId,
  sent: kept.payload as WaitingQuarantinedRecord['sent'],
  reason: kept.reason,
  holder:
    holder.kind === 'FIELD_EVENT'
      ? { kind: 'FIELD_EVENT', fieldEvent: fieldEventRecord(holder.fieldEvent) }
      : { kind: 'ROE', roe: roeRecord(holder.roe) },
  receivedAt: kept.receivedAt.toISOString(),
  resolvedById: kept.resolvedById,
  resolvedAt: time(kept.resolvedAt),
  resolution: kept.resolution,
});

const asked = (query: QueryOf<typeof listHeldRecordsEndpoint>): WaitingAsked => ({
  projectId: query.projectId,
  deviceId: query.deviceId,
  waiting: query.waiting === undefined ? undefined : query.waiting === 'true',
  after: query.after,
  limit: query.limit === undefined ? pageOf : Number(query.limit),
});

@Controller()
export class HeldController {
  private readonly review: HeldReview;
  private readonly reads: HeldReads;
  private readonly files: PhotographFiles;

  constructor(
    @Inject(apiHeldReview) review: HeldReview,
    @Inject(apiHeldReads) reads: HeldReads,
    @Inject(apiPhotographFiles) files: PhotographFiles,
  ) {
    this.review = review;
    this.reads = reads;
    this.files = files;
  }

  @Serves(listHeldRecordsEndpoint)
  async heldRecords(
    @Query() query: QueryOf<typeof listHeldRecordsEndpoint>,
    @Req() request: FastifyRequest,
  ): Promise<HeldRecordsAnswer> {
    const page = await this.reads.heldRecords(callerOf(request).userId, asked(query));
    return heldRecordsAnswerSchema.parse({
      heldRecords: page.rows.map(heldRecordShown),
      next: page.next,
    });
  }

  @Serves(saveHeldRecordEndpoint)
  async save(
    @Param() params: ParamsOf<typeof saveHeldRecordEndpoint>,
    @Body() body: BodyOf<typeof saveHeldRecordEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.review.save(
      callerOf(request).userId,
      params.heldRecordId,
      body.record,
      body.note,
    );
    return saveHeldRecordEndpoint.answer.parse(
      reviewed(
        request,
        outcome,
        ({ record }) => heldRecordShown(record),
        'A held record was saved as corrected.',
      ),
    );
  }

  @Serves(closeHeldRecordEndpoint)
  async close(
    @Param() params: ParamsOf<typeof closeHeldRecordEndpoint>,
    @Body() body: BodyOf<typeof closeHeldRecordEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.review.close(
      callerOf(request).userId,
      params.heldRecordId,
      body.note,
    );
    return closeHeldRecordEndpoint.answer.parse(
      reviewed(request, outcome, heldRecordShown, 'A held record was closed.'),
    );
  }

  @Serves(listSetAsideFilesEndpoint)
  async setAsideFiles(
    @Query() query: QueryOf<typeof listSetAsideFilesEndpoint>,
    @Req() request: FastifyRequest,
  ): Promise<SetAsideFilesAnswer> {
    const page = await this.reads.setAsideFiles(callerOf(request).userId, asked(query));
    return setAsideFilesAnswerSchema.parse({
      setAsideFiles: page.rows.map(setAsideShown),
      next: page.next,
    });
  }

  @Serves(setAsideFileEndpoint)
  async setAsideFile(
    @Param() params: ParamsOf<typeof setAsideFileEndpoint>,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<Buffer> {
    const caller = callerOf(request);
    const kept = await this.files.setAside(params.setAsideFileId);
    void reply.headers({
      'content-type': kept.contentType,
      'content-disposition': `attachment; filename="${params.setAsideFileId}-set-aside.${extensions[kept.contentType]}"`,
      'content-security-policy': fileAnswerPolicy,
    });
    request.log.info(
      { userId: caller.userId, bytes: kept.bytes.byteLength },
      'A person read a file set aside.',
    );
    return kept.bytes;
  }

  @Serves(closeSetAsideFileEndpoint)
  async closeSetAside(
    @Param() params: ParamsOf<typeof closeSetAsideFileEndpoint>,
    @Body() body: BodyOf<typeof closeSetAsideFileEndpoint>,
    @Req() request: FastifyRequest,
  ) {
    const outcome = await this.review.closeSetAside(
      callerOf(request).userId,
      params.setAsideFileId,
      body.note,
    );
    const shown = outcome.saved
      ? await this.reads.setAsideFile(callerOf(request).userId, outcome.record.id)
      : null;
    return closeSetAsideFileEndpoint.answer.parse(
      reviewed(
        request,
        outcome,
        () => (shown === null ? null : setAsideShown(shown)),
        'A file set aside was closed.',
      ),
    );
  }

  @Serves(listQuarantinedRecordsEndpoint)
  async quarantinedRecords(
    @Query() query: QueryOf<typeof listQuarantinedRecordsEndpoint>,
    @Req() request: FastifyRequest,
  ): Promise<QuarantinedRecordsAnswer> {
    const page = await this.reads.quarantinedRecords(callerOf(request).userId, asked(query));
    return quarantinedRecordsAnswerSchema.parse({
      quarantinedRecords: page.rows.map(quarantinedShown),
      next: page.next,
    });
  }
}
