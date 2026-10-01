// What the installer writes to disk (ADR-266): one git-ignored env file per service, each holding
// only that service's own logins and secrets, and a record of the installation with no secret in it.
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { parseEnv } from 'node:util';

export class EnvFile {
  readonly path: string;

  constructor(path: string) {
    this.path = path;
  }

  exists(): boolean {
    return existsSync(this.path);
  }

  // Readable and writable by its owner only.
  ownerOnly(): boolean {
    return (statSync(this.path).mode & 0o077) === 0;
  }

  read(): Record<string, string> {
    const values: Record<string, string> = {};
    for (const [key, value] of Object.entries(parseEnv(readFileSync(this.path, 'utf8')))) {
      if (value !== undefined) values[key] = value;
    }
    return values;
  }

  // Created exclusively: an existing file is never overwritten, so a secret is never replaced.
  create(header: string[], values: [string, string][]): void {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, EnvFile.render(header, values), { mode: 0o600, flag: 'wx' });
  }

  // Takes one value out, every other line left exactly as it was; still its owner's only. For a
  // secret that now lives somewhere safer, never to replace one: the file is written whole beside
  // itself, then swapped in, so it's never half there.
  remove(key: string): void {
    const kept = readFileSync(this.path, 'utf8')
      .split('\n')
      .filter((line) => !line.startsWith(`${key}=`))
      .join('\n');
    const next = `${this.path}.next`;
    writeFileSync(next, kept, { mode: 0o600, flag: 'wx' });
    renameSync(next, this.path);
  }

  static render(header: string[], values: [string, string][]): string {
    const lines = header.map((line) => `# ${line}`);
    for (const [key, value] of values) {
      // Single quotes keep `$` and `,` literal (an Argon2 hash has both).
      lines.push(/^[\w.:/@%+-]*$/.test(value) ? `${key}=${value}` : `${key}='${value}'`);
    }
    return `${lines.join('\n')}\n`;
  }
}

export interface InstallationRecord {
  format: 1;
  firm: string;
  mail: 'mail catcher' | 'none';
  database: { host: string; port: number; name: string };
  // When each step last finished, as ISO times.
  steps: Partial<Record<'secrets' | 'roles' | 'database', string>>;
  createdAt: string;
  updatedAt: string;
}

export class InstallationState {
  readonly path: string;

  constructor(path: string) {
    this.path = path;
  }

  exists(): boolean {
    return existsSync(this.path);
  }

  load(): InstallationRecord {
    return JSON.parse(readFileSync(this.path, 'utf8')) as InstallationRecord;
  }

  save(record: InstallationRecord): void {
    mkdirSync(dirname(this.path), { recursive: true });
    record.updatedAt = new Date().toISOString();
    writeFileSync(this.path, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  }
}

// Prisma's migrations folder. A guard migration starts as Prisma's empty stub (ADR-113); applied
// before its SQL is written, it would be recorded as done with nothing in it (ADR-270).
export class MigrationFolder {
  readonly path: string;

  constructor(path: string) {
    this.path = path;
  }

  // The migrations whose SQL is only comments and blank lines.
  unwritten(): string[] {
    if (!existsSync(this.path)) return [];
    return readdirSync(this.path, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => {
        const sql = join(this.path, name, 'migration.sql');
        return (
          existsSync(sql) &&
          readFileSync(sql, 'utf8')
            .split('\n')
            .every((line) => /^\s*(--.*)?$/.test(line))
        );
      })
      .sort();
  }
}
