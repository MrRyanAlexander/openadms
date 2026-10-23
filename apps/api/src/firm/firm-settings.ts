// The firm's own settings (REQ-214, 215; ARCHITECTURE §6, §7.4; spec/acceptance/10-api-and-sync.md
// AC-10-83, 85; ADR-520, 530): one record for the whole installation, written by the seed from
// the release's policy values and changed here, audited.
//
// - **Read** by an admin, or a manager/analyst who holds Setup now: the door asked, and the
//   service asks again inside its own piece of work (ADR-364).
// - **How many hours a lost phone keeps its key** (or off) is changed by the same people
//   (ADR-520 (1)). The worker reads it at each pass and revokes what is due (apps/worker).
// - **Whether read-only viewers must use two-step sign-in** is changed by an admin alone: it is
//   sign-in policy (C157). Sign-in reads it with the session on every request, so a viewer with
//   none is sent to set one up at their very next request.
// - **How many hours a monitor's sign-in on a phone lasts** (1 to 24; ADR-531, the user: shifts
//   never run past a day) is changed by an admin alone: it is sign-in policy. Each sign-in reads
//   it as it is made, online, under the passcode or taken from one made offline; a session
//   already open keeps its end.
// - **Where a reader of the firm's reports writes** (REQ-410) is changed by the same people as the
//   phones' hours: it is printed on the daily report's last page, nothing reads it otherwise.
// - **What the firm calls its ADMS** (the user, 2026-10-22) is asked once by the installer and
//   changed by the same people as the phones' hours. The public brand read, the mail and the daily
//   report say it (branding.ts).
// - Each change says the person's note, where they gave one, to the audit log as its reason.
import type { Prisma } from '@open-adms/db';
import { SetupRights } from '@open-adms/domain';

import { Refused, SetupService, type Outcome } from '../setup/setup-service.ts';

type Tx = Prisma.TransactionClient;

export interface FirmSettingsRead {
  readonly phoneKeyRevokedAfterHours: number | null;
  readonly viewerTwoStepRequired: boolean;
  readonly monitorSessionHours: number;
  readonly reportContactEmail: string | null;
  readonly brandName: string;
}

const settingsRead = {
  phoneKeyRevokedAfterHours: true,
  viewerTwoStepRequired: true,
  monitorSessionHours: true,
  reportContactEmail: true,
  brandName: true,
} as const;

export class FirmSettings extends SetupService {
  // The record, inside any piece of work. The seed writes it: an installation without it was
  // never seeded, and nothing here stands in for it.
  static async of(tx: Tx): Promise<FirmSettingsRead> {
    const row = await tx.firmSettings.findUnique({ where: { id: 1 }, select: settingsRead });
    if (row === null) {
      throw new Error(
        'The firm’s settings are missing: run `pnpm installer` (its seed writes them).',
      );
    }
    return row;
  }

  // Whether the firm requires two-step sign-in of its read-only viewers.
  static async viewersRequired(tx: Tx): Promise<boolean> {
    return (await FirmSettings.of(tx)).viewerTwoStepRequired;
  }

  // How many hours a monitor's sign-in on a phone lasts, as the firm has it now.
  static async monitorSessionHours(tx: Tx): Promise<number> {
    return (await FirmSettings.of(tx)).monitorSessionHours;
  }

  // The settings, for whoever may set the firm up; undefined for anybody else.
  async read(person: string): Promise<FirmSettingsRead | undefined> {
    return this.db.$read(async (tx) => {
      if ((await this.setupRefusal(tx, person)) !== null) return undefined;
      return FirmSettings.of(tx);
    });
  }

  // How many hours a phone marked lost or retired keeps its key; null switches it off.
  changePhoneKeyHours(
    person: string,
    hours: number | null,
    note?: string,
  ): Promise<Outcome<FirmSettingsRead>> {
    return this.writeAs(
      { actorId: person, source: 'BACK_OFFICE', ...(note === undefined ? {} : { reason: note }) },
      async (tx) => {
        const refusal = await this.setupRefusal(tx, person);
        if (refusal !== null) throw new Refused(refusal);
        return tx.firmSettings.update({
          where: { id: 1 },
          data: { phoneKeyRevokedAfterHours: hours },
          select: settingsRead,
        });
      },
    );
  }

  // The email address printed on the firm's reports' last page; null prints none (REQ-410).
  changeReportContact(
    person: string,
    email: string | null,
    note?: string,
  ): Promise<Outcome<FirmSettingsRead>> {
    return this.writeAs(
      { actorId: person, source: 'BACK_OFFICE', ...(note === undefined ? {} : { reason: note }) },
      async (tx) => {
        const refusal = await this.setupRefusal(tx, person);
        if (refusal !== null) throw new Refused(refusal);
        return tx.firmSettings.update({
          where: { id: 1 },
          data: { reportContactEmail: email },
          select: settingsRead,
        });
      },
    );
  }

  // What the firm calls its ADMS: whoever sets the firm up. The name is the domain's (BrandName),
  // read by the contract before it gets here; the database holds the rule again.
  changeBrandName(person: string, name: string, note?: string): Promise<Outcome<FirmSettingsRead>> {
    return this.writeAs(
      { actorId: person, source: 'BACK_OFFICE', ...(note === undefined ? {} : { reason: note }) },
      async (tx) => {
        const refusal = await this.setupRefusal(tx, person);
        if (refusal !== null) throw new Refused(refusal);
        return tx.firmSettings.update({
          where: { id: 1 },
          data: { brandName: name },
          select: settingsRead,
        });
      },
    );
  }

  // Whether read-only viewers must use two-step sign-in: an admin's alone.
  changeViewerTwoStep(
    person: string,
    required: boolean,
    note?: string,
  ): Promise<Outcome<FirmSettingsRead>> {
    return this.asAdmin(
      person,
      'change whether read-only viewers must use two-step sign-in',
      (tx) =>
        tx.firmSettings.update({
          where: { id: 1 },
          data: { viewerTwoStepRequired: required },
          select: settingsRead,
        }),
      note,
    );
  }

  // How many hours a monitor's sign-in on a phone lasts: an admin's alone.
  changeMonitorSessionHours(
    person: string,
    hours: number,
    note?: string,
  ): Promise<Outcome<FirmSettingsRead>> {
    return this.asAdmin(
      person,
      'change how long a monitor’s sign-in on a phone lasts',
      (tx) =>
        tx.firmSettings.update({
          where: { id: 1 },
          data: { monitorSessionHours: hours },
          select: settingsRead,
        }),
      note,
    );
  }

  private async setupRefusal(tx: Tx, person: string) {
    const user = await tx.user.findUnique({ where: { id: person } });
    const granted =
      user === null
        ? []
        : await tx.userPermission.findMany({ where: { userId: person, archivedAt: null } });
    return new SetupRights(
      user === null
        ? null
        : {
            name: user.name,
            role: user.role,
            archived: user.archivedAt !== null,
            granted: granted.map((grant) => grant.permission),
          },
    ).refusal();
  }
}
