// A photograph's file, read by the back office (ARCHITECTURE §6 "Uploads"; AC-10-48; T-25;
// BACKLOG 2.6.4 part 4; ADR-483). Open to every admin and manager/analyst. **Handed back as a
// download that is never run** (OWASP ASVS 5.0 V3.2.1, V5.4): the type its bytes said, which no
// browser may second-guess (`X-Content-Type-Options: nosniff`, on every answer); `Content-
// Disposition: attachment` with a name the server makes of the photograph's id, never the phone's;
// and a policy that sandboxes it, so a browser shown it anyway runs nothing in it. Kept nowhere on
// the way (`Cache-Control: no-store`, on every answer). The log says who read which file: never
// a fingerprint, a place in storage or anything the file holds (16.2.5).
import { photographFileEndpoint, type ParamsOf } from '@open-adms/contracts';
import type { PhotoFileType } from '@open-adms/domain';
import { Controller, Inject, Param, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { answerHeaders } from '../process/answer-headers.ts';
import { Serves } from '../process/serves.ts';
import { callerOf } from '../sign-in/admission.ts';
import { apiPhotographFiles, PhotographFiles } from './photograph-files.ts';

const extensions: Record<PhotoFileType, string> = {
  'image/jpeg': 'jpg',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/png': 'png',
  'image/tiff': 'tif',
};

// A file is data, never a page: on top of every answer's own policy, a sandbox.
export const fileAnswerPolicy = `${answerHeaders['content-security-policy']}; sandbox`;

@Controller()
export class PhotographFilesController {
  private readonly files: PhotographFiles;

  constructor(@Inject(apiPhotographFiles) files: PhotographFiles) {
    this.files = files;
  }

  @Serves(photographFileEndpoint)
  async file(
    @Param() params: ParamsOf<typeof photographFileEndpoint>,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<Buffer> {
    const caller = callerOf(request);
    const kept = await this.files.kept(params.photoId, params.file);
    void reply.headers({
      'content-type': kept.contentType,
      'content-disposition': `attachment; filename="${params.photoId}-${params.file}.${extensions[kept.contentType]}"`,
      'content-security-policy': fileAnswerPolicy,
    });
    request.log.info(
      { userId: caller.userId, file: params.file, bytes: kept.bytes.byteLength },
      'A person read a photograph’s file.',
    );
    return kept.bytes;
  }
}
