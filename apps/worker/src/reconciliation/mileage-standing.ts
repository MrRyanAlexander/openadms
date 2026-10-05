// When a mileage a collection row holds still stands (spec/acceptance/06-reconciliation.md
// AC-06-56; ADR-349, 350 (3), 352). A mileage is asked for again only when one of its two ends
// moved: the collection's end GPS, or the disposal site's own GPS. Nothing keeps the two ends a
// second time (the user, ADR-350): they are on the records themselves, so what says an end moved
// is the audit log, which the database writes for every change. A mileage stands while, since
// the audit record that wrote it, no audit record says the collection's end GPS was corrected,
// its disposal was pointed at another site, or that site's GPS was corrected. A reprocess for
// any other reason, and newer map data, change no mileage.
import type { Database } from '@open-adms/db';

import type { CollectionRowRead } from './project-read.ts';
import type { MileageStands } from './ticket-work.ts';

const rowTables = {
  LOAD: 'completed_load_collection',
  HAUL_OUT: 'completed_haul_out_collection',
} as const;

export class MileageStanding implements MileageStands {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async stands(
    workflow: 'LOAD' | 'HAUL_OUT',
    row: CollectionRowRead,
    disposalEventId: string,
    siteId: string,
  ): Promise<boolean> {
    // The record that wrote the mileage the row holds: its insert, or the last change to it.
    const written = await this.db.auditRecord.findFirst({
      where: {
        tableName: rowTables[workflow],
        recordId: row.id,
        changedFields: { has: 'mileage' },
      },
      orderBy: { id: 'desc' },
    });
    if (written === null) return false;
    const moved = await this.db.auditRecord.findFirst({
      where: {
        id: { gt: written.id },
        OR: [
          {
            tableName: 'field_event',
            recordId: row.collectionEventId,
            changedFields: { hasSome: ['end_latitude', 'end_longitude'] },
          },
          {
            tableName: 'field_event',
            recordId: disposalEventId,
            changedFields: { has: 'site_id' },
          },
          {
            tableName: 'disposal_site',
            recordId: siteId,
            changedFields: { hasSome: ['latitude', 'longitude'] },
          },
        ],
      },
    });
    return moved === null;
  }
}
