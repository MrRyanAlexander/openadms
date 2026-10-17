// A photograph's files, sent by the phone that took it (ARCHITECTURE §6 "Uploads", §9 (5), §11;
// AC-05-09, AC-10-47…49; T-25; BACKLOG 2.6.4; ADR-482). Open to a phone that has proved itself;
// nobody need be signed in. The log says which phone, which file and where it stands: never a
// fingerprint, a place in storage or anything the file holds (OWASP ASVS 5.0 16.2.5).
import {
  photoFileEndpoint,
  sendPhotoFilePartEndpoint,
  type ParamsOf,
  type PhotoFileAnswer,
  type QueryOf,
} from '@open-adms/contracts';
import { Body, Controller, Inject, Param, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { Serves } from '../process/serves.ts';
import { phoneOf } from '../sign-in/admission.ts';
import { apiPhotoFiles, PhotoFiles } from './photo-files.ts';

@Controller()
export class PhotoFilesController {
  private readonly files: PhotoFiles;

  constructor(@Inject(apiPhotoFiles) files: PhotoFiles) {
    this.files = files;
  }

  @Serves(photoFileEndpoint)
  async standing(
    @Param() params: ParamsOf<typeof photoFileEndpoint>,
    @Req() request: FastifyRequest,
  ): Promise<PhotoFileAnswer> {
    const phone = phoneOf(request);
    const answer = await this.files.standing(phone.deviceId, params.photoId, params.file);
    request.log.info(
      { deviceId: phone.deviceId, file: params.file, upload: answer.upload },
      'A phone asked where a photograph’s file stands.',
    );
    return answer;
  }

  @Serves(sendPhotoFilePartEndpoint)
  async part(
    @Param() params: ParamsOf<typeof sendPhotoFilePartEndpoint>,
    @Query() query: QueryOf<typeof sendPhotoFilePartEndpoint>,
    @Body() bytes: Uint8Array,
    @Req() request: FastifyRequest,
  ): Promise<PhotoFileAnswer> {
    const phone = phoneOf(request);
    const answer = await this.files.part(phone.deviceId, params.photoId, params.file, {
      offset: Number(query.offset),
      length: Number(query.length),
      bytes,
    });
    request.log.info(
      {
        deviceId: phone.deviceId,
        file: params.file,
        partBytes: bytes.byteLength,
        upload: answer.upload,
        ...(answer.upload === 'RECEIVING' ? { received: answer.received } : {}),
      },
      'A phone sent a part of a photograph’s file.',
    );
    return answer;
  }
}
