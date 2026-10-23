// The brand read (the user, 2026-10-22): what the firm calls its ADMS and the Open ADMS release it
// is built on, to anybody, since the sign-in screens show it. Nothing else is said: no firm, no
// setting. The caller is limited by address like every other, as the health read is.
import { brandAnswerSchema, brandEndpoint, type BrandAnswer } from '@open-adms/contracts';
import { Controller, Inject } from '@nestjs/common';

import { Serves } from '../process/serves.ts';
import { Branding, apiBranding } from './branding.ts';

@Controller()
export class BrandController {
  private readonly branding: Branding;

  constructor(@Inject(apiBranding) branding: Branding) {
    this.branding = branding;
  }

  @Serves(brandEndpoint)
  async read(): Promise<BrandAnswer> {
    return brandAnswerSchema.parse(await this.branding.current());
  }
}
