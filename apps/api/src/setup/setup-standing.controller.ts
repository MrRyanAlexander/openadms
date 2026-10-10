// The setup as it stands, asked for (spec/parts/01-setup.md, "The setup check" and "What each
// site's phones will ask for"; ARCHITECTURE §6; AC-01-69…77; BACKLOG 2.4.2, C97; ADR-229, 423,
// 426, 453): the setup check's list and the sites' quantity lookup, one site's also as its
// phones held it under a setup version. Each reads the project's setup and writes nothing;
// neither holds a rate. The door has asked that the caller is an admin or a
// manager/analyst: they take no permission, so whoever reviews tickets may ask them too. A
// read-only viewer's sight of them is task 2.4.5's.
import {
  quantityLookupEndpoint,
  setupCheckEndpoint,
  siteQuantityLookupEndpoint,
  type ParamsOf,
  type QueryOf,
} from '@open-adms/contracts';
import { Controller, Inject, Param, Query } from '@nestjs/common';

import { Refusal } from '../process/refusal.ts';
import { Serves } from '../process/serves.ts';
import { SetupStanding } from './setup-standing.ts';

export const apiSetupStanding = Symbol('the API’s reading of the setup as it stands');

@Controller()
export class SetupStandingController {
  private readonly standing: SetupStanding;

  constructor(@Inject(apiSetupStanding) standing: SetupStanding) {
    this.standing = standing;
  }

  @Serves(setupCheckEndpoint)
  async setupCheck(@Param() params: ParamsOf<typeof setupCheckEndpoint>) {
    return setupCheckEndpoint.answer.parse({ gaps: await this.standing.gaps(params.projectId) });
  }

  @Serves(quantityLookupEndpoint)
  async quantityLookup(@Param() params: ParamsOf<typeof quantityLookupEndpoint>) {
    return quantityLookupEndpoint.answer.parse({
      asks: await this.standing.quantityLookup(params.projectId),
    });
  }

  // As the setup stands; or, asked with a setup version, as the site's phones held it then.
  @Serves(siteQuantityLookupEndpoint)
  async siteQuantityLookup(
    @Param() params: ParamsOf<typeof siteQuantityLookupEndpoint>,
    @Query() query: QueryOf<typeof siteQuantityLookupEndpoint>,
  ) {
    const asks =
      query.setupVersion === undefined
        ? await this.standing.quantityLookupAt(params.siteId)
        : await this.standing.quantityLookupUnder(params.siteId, Number(query.setupVersion));
    if (asks === null) throw new Refusal('NOT_FOUND', 404);
    return siteQuantityLookupEndpoint.answer.parse({ asks });
  }
}
