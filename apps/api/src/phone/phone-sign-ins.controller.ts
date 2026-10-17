// A monitor signing in and out on a phone (ARCHITECTURE §6, Device sessions, Abuse; §7.2;
// AC-02-39; AC-10-18, 19, 32; BACKLOG 2.5.2, C93, C113; ADR-416, 441, 443). The sign-in is open
// to a phone that has proved itself; signing out and who is signed in, to that phone with its
// monitor's session token. A sign-in is answered the monitor's assignment for the day, or why
// the phone took none (AC-02-35; ADR-444). The log says that a sign-in worked or why it didn't,
// by code and id: never the Monitor ID, the password or the token.
import {
  monitorSignedInAnswerSchema,
  phoneMonitorAnswerSchema,
  phoneMonitorEndpoint,
  signedOutAnswerSchema,
  signInOnPhoneEndpoint,
  signOutOnPhoneEndpoint,
  type BodyOf,
  type MonitorSignedInAnswer,
  type PhoneMonitorAnswer,
  type SignedOutAnswer,
} from '@open-adms/contracts';
import { Body, Controller, Inject, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { apiLimits, Limits } from '../process/limits.ts';
import { Refusal } from '../process/refusal.ts';
import { Serves } from '../process/serves.ts';
import { monitorOf, phoneOf } from '../sign-in/admission.ts';
import { PhoneSignIns } from './phone-sign-ins.ts';

export const apiPhoneSignIns = Symbol('the API’s monitors signed in on phones');

@Controller()
export class PhoneSignInsController {
  private readonly signIns: PhoneSignIns;
  private readonly limits: Limits;

  constructor(@Inject(apiPhoneSignIns) signIns: PhoneSignIns, @Inject(apiLimits) limits: Limits) {
    this.signIns = signIns;
    this.limits = limits;
  }

  @Serves(signInOnPhoneEndpoint)
  async signIn(
    @Body() body: BodyOf<typeof signInOnPhoneEndpoint>,
    @Req() request: FastifyRequest,
  ): Promise<MonitorSignedInAnswer> {
    const phone = phoneOf(request);
    // An address refused too often already, here or at this login, is stopped before the login
    // is touched, as at the back office's sign-in: its try is never a wrong try (ADR-416).
    const login = body.monitorNumber.trim().toUpperCase();
    const underWay = this.limits.mayTry(request.ip, login);
    try {
      const outcome = await this.signIns.signIn(phone, body.monitorNumber, body.password);
      if (!outcome.signedIn) {
        request.log.info(
          { why: outcome.why, deviceId: phone.deviceId },
          'A monitor’s sign-in on a phone was refused.',
        );
        if (outcome.why === 'PHONE_OUT_OF_SERVICE') {
          throw new Refusal(
            'PHONE_OUT_OF_SERVICE',
            409,
            'Not signed in: this phone was taken out of service. A monitor signs in on a phone in service.',
          );
        }
        this.limits.wrongTry(request.ip, login);
        throw new Refusal('SIGN_IN_REFUSED', 401);
      }
      this.limits.signedIn(request.ip, login);
      const { assignment } = outcome;
      request.log.info(
        {
          deviceId: phone.deviceId,
          userId: outcome.userId,
          ...(assignment.taken
            ? { assignmentId: assignment.assignment.id }
            : { noAssignment: assignment.why }),
        },
        'A monitor signed in on a phone.',
      );
      return monitorSignedInAnswerSchema.parse({
        token: outcome.token,
        userId: outcome.userId,
        monitorNumber: outcome.monitorNumber,
        name: outcome.name,
        expiresInSeconds: this.signIns.secondsLeft(outcome.expiresAt),
        assignment: assignment.taken ? assignment.assignment : null,
        noAssignment: assignment.taken ? null : assignment.why,
      });
    } finally {
      underWay.over();
    }
  }

  @Serves(signOutOnPhoneEndpoint)
  async signOut(@Req() request: FastifyRequest): Promise<SignedOutAnswer> {
    const monitor = monitorOf(request);
    await this.signIns.signOut(monitor);
    request.log.info(
      { deviceId: monitor.deviceId, userId: monitor.userId },
      'A monitor signed out on a phone.',
    );
    return signedOutAnswerSchema.parse({ status: 'signed-out' });
  }

  @Serves(phoneMonitorEndpoint)
  current(@Req() request: FastifyRequest): PhoneMonitorAnswer {
    const monitor = monitorOf(request);
    return phoneMonitorAnswerSchema.parse({
      userId: monitor.userId,
      monitorNumber: monitor.monitorNumber,
      name: monitor.name,
      expiresInSeconds: this.signIns.secondsLeft(monitor.expiresAt),
      masterPasscodeSession: monitor.masterPasscodeSession,
    });
  }
}
