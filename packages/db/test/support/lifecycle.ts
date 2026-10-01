// Every database test runs in its own rolled-back work, on a freshly built example world.
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';

import { GuardedDatabase } from './database.ts';
import { ExampleWorld, type World } from './example-world.ts';

export interface Tested {
  db: GuardedDatabase;
  world: World;
}

// Call once at the top of a test file; the returned object is filled before each test runs.
export function eachTestRolledBack(): Tested {
  const tested = {} as Tested;
  let opened: GuardedDatabase | undefined;
  beforeAll(async () => {
    opened = await GuardedDatabase.open();
    tested.db = opened;
  });
  afterAll(async () => {
    await opened?.close();
  });
  beforeEach(async () => {
    await tested.db.begin();
    tested.world = await ExampleWorld.build(tested.db);
  });
  afterEach(async () => {
    await tested.db.rollback();
  });
  return tested;
}
