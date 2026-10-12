// A phone's sync (ARCHITECTURE §9, §10; AC-05-03, 04, 16, 45; AC-10-46, 51; BACKLOG 2.6.2, C86,
// C128…C131; ADR-466…472). Open to a phone that has proved itself; nobody need be signed in.
// The log says which phone synced, the sync's id, how far its clock stood from the server's,
// how many of each thing got which answer, the master passcode's version and whether its check
// was sent, and the setup version sent: never a record, an id a record was sent under, what
// one that couldn't be read was told, anything a record names, or a check (OWASP ASVS 5.0
// 16.2.5).
import {
  syncAnsweredSchema,
  syncPhoneEndpoint,
  type BodyOf,
  type SyncAnswered,
} from '@open-adms/contracts';
import { Body, Controller, Inject, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { Serves } from '../process/serves.ts';
import { phoneOf } from '../sign-in/admission.ts';
import { Sync } from './sync.ts';

export const apiSync = Symbol('the API’s sync');

// How many of a part's answers were each answer.
const counted = (answers: readonly { readonly answer: string }[]): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const { answer } of answers) counts[answer] = (counts[answer] ?? 0) + 1;
  return counts;
};

@Controller()
export class SyncController {
  private readonly sync: Sync;

  constructor(@Inject(apiSync) sync: Sync) {
    this.sync = sync;
  }

  @Serves(syncPhoneEndpoint)
  async synced(
    @Body() body: BodyOf<typeof syncPhoneEndpoint>,
    @Req() request: FastifyRequest,
  ): Promise<SyncAnswered> {
    const phone = phoneOf(request);
    const { syncId, clockDifferenceSeconds, setupVersionSent, answered } = await this.sync.received(
      phone.deviceId,
      body,
    );
    request.log.info(
      {
        deviceId: phone.deviceId,
        syncId,
        clockDifferenceSeconds,
        unplannedAssignments: counted(answered.unplannedAssignments),
        passcodeUses: counted(answered.passcodeUses),
        records: counted(answered.records),
        seriesToppedUp: answered.numbers.filter(({ toppedUp }) => toppedUp).length,
        seriesNotToppedUp: answered.numbers.filter(({ toppedUp }) => !toppedUp).length,
        masterPasscodeVersion: answered.masterPasscode.version,
        masterPasscodeCheckSent: answered.masterPasscode.check !== null,
        setupVersionSent,
      },
      'A phone synced.',
    );
    return syncAnsweredSchema.parse(answered);
  }
}
