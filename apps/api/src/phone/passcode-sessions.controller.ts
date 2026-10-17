// A session opened on a phone under the master passcode (ARCHITECTURE §7.2, §7.3, §7.5;
// AC-02-42; AC-10-22, 32; BACKLOG 2.5.4, C93, C113; ADR-416, 438, 456, 462). Open to a phone
// that has proved itself; the master passcode in the request opens the act. The log says that
// one was opened or why none was, by code and id: never the passcode, the token, the monitor's
// name or their number.
import {
  openPasscodeSessionOnPhoneEndpoint,
  passcodeSessionOpenedAnswerSchema,
  type BodyOf,
  type PasscodeSessionOpenedAnswer,
} from '@open-adms/contracts';
import { Body, Controller, Inject, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { apiLimits, Limits } from '../process/limits.ts';
import { Refusal } from '../process/refusal.ts';
import { Serves } from '../process/serves.ts';
import { phoneOf } from '../sign-in/admission.ts';
import { atThePasscode } from './master-passcode-check.ts';
import { PasscodeSessions } from './passcode-sessions.ts';

export const apiPasscodeSessions = Symbol('the API’s sessions under the master passcode');

@Controller()
export class PasscodeSessionsController {
  private readonly sessions: PasscodeSessions;
  private readonly limits: Limits;

  constructor(
    @Inject(apiPasscodeSessions) sessions: PasscodeSessions,
    @Inject(apiLimits) limits: Limits,
  ) {
    this.sessions = sessions;
    this.limits = limits;
  }

  @Serves(openPasscodeSessionOnPhoneEndpoint)
  async open(
    @Body() body: BodyOf<typeof openPasscodeSessionOnPhoneEndpoint>,
    @Req() request: FastifyRequest,
  ): Promise<PasscodeSessionOpenedAnswer> {
    const phone = phoneOf(request);
    // An address refused too often already is stopped before the passcode is touched, as at
    // enrolment: its try is never a wrong try there (ADR-416, 438).
    const underWay = this.limits.mayTry(request.ip, atThePasscode);
    try {
      const outcome = await this.sessions.open(phone, body);
      if (!outcome.opened) {
        request.log.info(
          { why: outcome.why, deviceId: phone.deviceId },
          'A session under the master passcode was refused.',
        );
        if (outcome.why === 'PHONE_OUT_OF_SERVICE') {
          throw new Refusal(
            'PHONE_OUT_OF_SERVICE',
            409,
            'Not opened: this phone was taken out of service. A session is opened on a phone in service.',
          );
        }
        // The passcode was right: told only to somebody who holds it. No wrong try.
        if (outcome.why === 'NOT_A_MONITOR') {
          throw new Refusal(
            'NOT_A_MONITOR',
            422,
            'Not opened: a session under the master passcode is for a field monitor in service. Pick the monitor from the phone’s list.',
          );
        }
        this.limits.wrongTry(request.ip, atThePasscode);
        throw new Refusal('MASTER_PASSCODE_REFUSED', 401);
      }
      this.limits.signedIn(request.ip, atThePasscode);
      const { assignment } = outcome;
      request.log.warn(
        {
          deviceId: phone.deviceId,
          userId: outcome.userId,
          masterPasscodeSession: outcome.masterPasscodeSession,
          ...(assignment.taken
            ? { assignmentId: assignment.assignment.id }
            : { noAssignment: assignment.why }),
        },
        'A session was opened on a phone under the master passcode.',
      );
      return passcodeSessionOpenedAnswerSchema.parse({
        token: outcome.token,
        userId: outcome.userId,
        monitorNumber: outcome.monitorNumber,
        name: outcome.name,
        expiresInSeconds: outcome.expiresInSeconds,
        assignment: assignment.taken ? assignment.assignment : null,
        noAssignment: assignment.taken ? null : assignment.why,
        masterPasscodeSession: outcome.masterPasscodeSession,
      });
    } finally {
      underWay.over();
    }
  }
}
