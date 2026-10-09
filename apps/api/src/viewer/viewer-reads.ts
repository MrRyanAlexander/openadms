// What a read-only viewer reads (ARCHITECTURE §5.5, §14; spec/parts/02; AC-02-74; AC-10-29, 30;
// BACKLOG 2.4.5, C22; ADR-050, 169, 315, 434): a client user, a contractor user or an auditor.
// Every read here goes through the one place that states the viewer to the database
// (`ViewerDatabase.$viewed`), as the database's read-only login: which rows and which columns
// come back is the database's to say, from the viewer's own record as it stands now (their
// projects, their kind, their contractor). Nothing is filtered here a second time, and nothing
// here can write. A person who is no viewer, or was archived a moment ago, is shown nothing.
import type { ViewerDatabase } from '@open-adms/db';

export interface ViewerProjectsAsked {
  // The last project of the page before.
  readonly after?: string | undefined;
  readonly limit: number;
}

export interface ViewerProjectRead {
  readonly id: string;
  readonly name: string;
  readonly timeZone: string;
  readonly closedAt: string | null;
}

export interface ViewerProjectsPage {
  readonly projects: ViewerProjectRead[];
  readonly next: string | null;
}

export class ViewerReads {
  private readonly viewed: ViewerDatabase;

  constructor(viewed: ViewerDatabase) {
    this.viewed = viewed;
  }

  // The projects the viewer is given, in the order they were entered: what every viewer may
  // read of a project, a contractor user included (its name, time zone and dates; ADR-315).
  async projects(viewerId: string, asked: ViewerProjectsAsked): Promise<ViewerProjectsPage> {
    return this.viewed.$viewed(viewerId, async (tx): Promise<ViewerProjectsPage> => {
      const rows = await tx.project.findMany({
        where: asked.after === undefined ? {} : { id: { gt: asked.after } },
        orderBy: { id: 'asc' },
        // One more than the page, to know whether another follows.
        take: asked.limit + 1,
        // Only columns the read-only login is granted: any other is the database's refusal.
        select: { id: true, name: true, timeZone: true, closedAt: true },
      });
      const page = rows.slice(0, asked.limit);
      return {
        projects: page.map((row) => ({
          id: row.id,
          name: row.name,
          timeZone: row.timeZone,
          closedAt: row.closedAt?.toISOString() ?? null,
        })),
        next: rows.length > asked.limit ? (page.at(-1)?.id ?? null) : null,
      };
    });
  }
}
