// What the firm calls its ADMS and which Open ADMS it is built on (the user, 2026-10-22), as the
// pages and documents the API makes say them. The name is the firm's, in its settings record
// (firm-settings.ts), changed by whoever sets the firm up; the version is the release's, the root
// package.json's, read once as the API starts (process/release.ts). Neither is a secret.
import type { Database, Prisma } from '@open-adms/db';
import type { BrandAnswer } from '@open-adms/contracts';

import { FirmSettings } from './firm-settings.ts';

export const apiBranding = Symbol('the API’s branding');

export class Branding {
  private readonly db: Database;
  private readonly version: string;

  constructor(db: Database, version: string) {
    this.db = db;
    this.version = version;
  }

  // The brand, inside any piece of work.
  static async in(tx: Prisma.TransactionClient, version: string): Promise<BrandAnswer> {
    return { name: (await FirmSettings.of(tx)).brandName, version };
  }

  // The brand as it stands now.
  current(): Promise<BrandAnswer> {
    return this.db.$read((tx) => Branding.in(tx, this.version));
  }
}
