// The secrets scan (ARCHITECTURE §15, §16; ADR-276): the files git would commit, looked at three
// ways, and the env files, which must never be committed. It never prints a secret: a finding is
// its file, line and rule only. secretlint's own report carries every file's whole content, so it
// is read here in memory and never passed on.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';

import type { Outcome, Repository } from './repository.ts';

interface SecretlintFile {
  filePath: string;
  messages: { ruleId: string; loc: { start: { line: number } } }[];
}

interface Finding {
  file: string;
  line: number;
  rule: string;
}

// The installation's own secrets live in these files, which the installer and the local stack write.
const installationEnvFiles = [
  'infra/local/.env',
  'packages/db/.env',
  'apps/api/.env',
  'apps/worker/.env',
];
// A setting is secret by its name; a URL's password is secret wherever it is.
const secretKey = /PASSWORD|PASSWD|SECRET|TOKEN|KEY|HASH/i;
// Shorter values (a port, "postgres") would match ordinary text; the installer's secrets are long.
const shortest = 12;

// Config files a password-like setting would be written into: YAML, env, JSON, TOML, INI.
export const configFile = /(\.ya?ml|\.json|\.toml|\.ini|\.conf|\.properties|(^|\/)\.env[^/]*)$/i;
const passwordLike =
  /^\s*["']?([A-Za-z0-9_.-]*(?:PASSWORD|PASSWD|SECRET|SECRET_KEY|ACCESS_KEY|TOKEN|API_KEY|PRIVATE_KEY))["']?\s*[:=]\s*(.*)$/i;
// Not a literal: empty, a reference (${VAR}, <placeholder>), a YAML block that follows, or the
// opening of an object or a list on a line of its own (a JSON schema's property named
// "password", as the generated OpenAPI description has: ADR-405). What such an opening holds is
// read on the lines after it, each by this same rule.
const notLiteral = /^(["']{2}|null|~|\$\{.*\}|<[^>]*>|[|>][-+]?|[{[])?,?$/;

// The setting's name when a config line gives a password-like setting a literal value.
export function passwordLikeSetting(line: string): string | undefined {
  const [, key, value] = passwordLike.exec(line) ?? [];
  if (key === undefined || value === undefined) return undefined;
  return notLiteral.test(value.trim()) ? undefined : key;
}

// The secrets in one env file's values: each secret-named setting's value, and each URL's password,
// of the length a generated secret has.
export function secretsIn(values: Record<string, string | undefined>): string[] {
  const secrets = new Set<string>();
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) continue;
    if (secretKey.test(key)) secrets.add(value);
    if (URL.canParse(value)) {
      const password = decodeURIComponent(new URL(value).password);
      if (password !== '') secrets.add(password);
    }
  }
  return [...secrets].filter((secret) => secret.length >= shortest);
}

export class SecretsScan {
  private readonly repository: Repository;
  private readonly tool: string;

  constructor(repository: Repository) {
    this.repository = repository;
    this.tool = join(repository.root, 'tools/security/node_modules/.bin/secretlint');
  }

  run(): Outcome[] {
    const files = this.repository.committable();
    const title = `Secrets scan (${String(files.length)} files git would commit)`;
    const found = {
      secretlint: this.secretlint(files),
      ownSecrets: this.ownSecrets(files),
      passwordLike: this.passwordLike(files),
    };
    const secrets = this.installationSecrets();
    return [
      this.outcome(title, 'secretlint 13.0.5, its recommended rules', found.secretlint),
      this.outcome(
        title,
        `the installation's own secrets (${String(secrets.length)} values from ${String(installationEnvFiles.length)} env files)`,
        found.ownSecrets,
      ),
      this.outcome(title, 'a password-like setting with a literal value', found.passwordLike),
      this.exceptions(title, files),
    ];
  }

  // Each inline secretlint exception, named on every run so none hides; each needs its reason.
  // The installation's own secrets are checked whatever a comment says.
  private exceptions(title: string, files: string[]): Outcome {
    const found = this.eachLine(files, (line) =>
      /(\/\/|#|\/\*)\s*secretlint-disable/.test(line) ? 'inline exception' : undefined,
    );
    return {
      title,
      lines: [
        `inline exceptions to secretlint: ${found.length === 0 ? 'none' : found.map((finding) => `${finding.file}:${String(finding.line)}`).join(', ')}`,
      ],
      ok: true,
    };
  }

  private outcome(title: string, what: string, findings: Finding[]): Outcome {
    return {
      title,
      lines: [
        `${findings.length === 0 ? '✓' : '✗'} ${what}: ${String(findings.length)} found`,
        ...findings.map((finding) => `  ${finding.file}:${String(finding.line)} ${finding.rule}`),
      ],
      ok: findings.length === 0,
    };
  }

  private secretlint(files: string[]): Finding[] {
    const config = JSON.stringify({
      rules: [{ id: '@secretlint/secretlint-rule-preset-recommend' }],
    });
    const result = spawnSync(
      this.tool,
      [
        '--format',
        'json',
        '--no-glob',
        '--no-color',
        '--secretlintrcJSON',
        config,
        ...files.map((file) => join(this.repository.root, file)),
      ],
      { cwd: join(this.repository.root, 'tools/security'), encoding: 'utf8', maxBuffer: 1 << 28 },
    );
    let report: SecretlintFile[];
    try {
      report = JSON.parse(result.stdout) as SecretlintFile[];
    } catch {
      // Its error text could quote a file; say only that it failed.
      throw new Error(`secretlint gave no report (exit ${String(result.status)}).`);
    }
    return report.flatMap((file) =>
      file.messages.map((message) => ({
        file: file.filePath.slice(this.repository.root.length + 1),
        line: message.loc.start.line,
        rule: message.ruleId.replace('@secretlint/secretlint-rule-', ''),
      })),
    );
  }

  // Every secret the installation holds, from its env files.
  private installationSecrets(): string[] {
    const secrets = new Set<string>();
    for (const file of installationEnvFiles) {
      const path = join(this.repository.root, file);
      if (!existsSync(path)) continue;
      for (const secret of secretsIn(parseEnv(readFileSync(path, 'utf8')))) secrets.add(secret);
    }
    return [...secrets];
  }

  private ownSecrets(files: string[]): Finding[] {
    const secrets = this.installationSecrets();
    return this.eachLine(files, (line) =>
      secrets.some((secret) => line.includes(secret)) ? 'installation-secret' : undefined,
    );
  }

  private passwordLike(files: string[]): Finding[] {
    return this.eachLine(
      files.filter((file) => configFile.test(file)),
      (line) => {
        const key = passwordLikeSetting(line);
        return key === undefined ? undefined : `password-like-setting ${key}`;
      },
    );
  }

  private eachLine(files: string[], test: (line: string) => string | undefined): Finding[] {
    const findings: Finding[] = [];
    for (const file of files) {
      const text = readFileSync(join(this.repository.root, file), 'utf8');
      text.split('\n').forEach((line, index) => {
        const rule = test(line);
        if (rule !== undefined) findings.push({ file, line: index + 1, rule });
      });
    }
    return findings;
  }
}

// Every env file on disk is ignored by git and untracked, so none can be committed.
export class EnvFilesCheck {
  private readonly repository: Pick<Repository, 'envFiles' | 'ignored' | 'tracked'>;

  constructor(repository: Pick<Repository, 'envFiles' | 'ignored' | 'tracked'>) {
    this.repository = repository;
  }

  run(): Outcome {
    const files = this.repository.envFiles();
    const ignored = new Set(this.repository.ignored(files));
    const tracked = new Set(this.repository.tracked(files));
    const wrong = files.flatMap((file) => [
      ...(ignored.has(file) ? [] : [`  ${file}: not ignored by git`]),
      ...(tracked.has(file) ? [`  ${file}: tracked by git`] : []),
    ]);
    return {
      title: `Env files (${String(files.length)} on disk)`,
      lines: [
        wrong.length === 0
          ? '✓ every one ignored by git and untracked'
          : `✗ ${String(wrong.length)} could be committed`,
        ...wrong,
      ],
      ok: wrong.length === 0,
    };
  }
}
