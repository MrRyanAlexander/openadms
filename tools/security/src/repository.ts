// What the security checks look at in the repository (ADR-276): the files git would commit, and
// every env file on disk. Git is only read (ls-files, check-ignore), never written (ADR-008).
import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// One check's verdict: what it looked at, a line per finding, and whether it passed.
export interface Outcome {
  readonly title: string;
  readonly lines: readonly string[];
  readonly ok: boolean;
}

export class Repository {
  readonly root: string;

  constructor(root: string) {
    this.root = root;
  }

  // Tracked files and untracked ones git doesn't ignore: what `git add .` would commit.
  committable(): string[] {
    return this.git(['ls-files', '-z', '--cached', '--others', '--exclude-standard'])
      .split('\0')
      .filter((path) => path !== '' && this.isFile(path))
      .sort();
  }

  // Every .env and .env.* file (but .env.example) on disk, outside node_modules and .git.
  envFiles(): string[] {
    const found: string[] = [];
    const walk = (folder: string): void => {
      for (const entry of readdirSync(folder, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        const path = join(folder, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/^\.env(\..+)?$/.test(entry.name) && entry.name !== '.env.example') {
          found.push(relative(this.root, path));
        }
      }
    };
    walk(this.root);
    return found.sort();
  }

  tracked(paths: readonly string[]): string[] {
    if (paths.length === 0) return [];
    return this.git(['ls-files', '-z', '--cached', '--', ...paths])
      .split('\0')
      .filter((path) => path !== '');
  }

  ignored(paths: readonly string[]): string[] {
    if (paths.length === 0) return [];
    // check-ignore exits 1 when none is ignored; that's an answer, not a failure.
    return this.git(['check-ignore', '-z', '--no-index', '--stdin'], [0, 1], paths.join('\0'))
      .split('\0')
      .filter((path) => path !== '');
  }

  private isFile(path: string): boolean {
    try {
      return statSync(join(this.root, path)).isFile();
    } catch {
      return false; // tracked, but deleted on disk
    }
  }

  private git(args: string[], okStatuses: readonly number[] = [0], input?: string): string {
    const result = spawnSync('git', args, { cwd: this.root, encoding: 'utf8', input });
    if (result.error !== undefined || !okStatuses.includes(result.status ?? -1)) {
      throw new Error(`git ${args[0] ?? ''} failed: ${result.stderr.trim()}`);
    }
    return result.stdout;
  }
}
