// The third-party notices an installation's images carry (the user, 2026-10-23: production makes
// "sure all license details and dependencies are noted properly"). Reads `pnpm licenses list
// --prod --json` on stdin and writes Markdown to stdout: every package that ships, its version,
// its licence, where it comes from, and its licence's own text as the package carries it. Run in
// the server's image build (infra/server/Dockerfile), after index.ts has checked every licence.
// Node 24 runs this file as-is (type stripping), so it uses erasable TypeScript only.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { text } from 'node:stream/consumers';

interface InstalledPackage {
  name: string;
  versions: string[];
  paths?: string[];
  license: string;
  author?: string;
  homepage?: string;
}

// The files a package keeps its licence's text in, by the names packages use.
const licenceFile = /^(licen[cs]e|copying|notice)(\.(md|txt|markdown))?$/i;

function licenceTexts(folder: string | undefined): string[] {
  if (folder === undefined || !existsSync(folder)) return [];
  return readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isFile() && licenceFile.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .map((name) => readFileSync(join(folder, name), 'utf8').trim());
}

// Our own packages are the release's, under its LICENSE and NOTICE.
const ours = (name: string): boolean => name.startsWith('@open-adms/');

const report = JSON.parse(await text(process.stdin)) as Record<string, InstalledPackage[]>;
const packages = Object.values(report)
  .flat()
  .filter((pkg) => !ours(pkg.name))
  .flatMap((pkg) =>
    pkg.versions.map((version, index) => ({ ...pkg, version, path: pkg.paths?.[index] })),
  )
  .sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));

const out: string[] = [
  '# Third-party notices',
  '',
  'Open ADMS is licensed under the Apache License 2.0 (LICENSE, NOTICE). It is built on the',
  `${String(packages.length)} packages below, each under its own licence, named and quoted as the package carries it.`,
  '',
  '| Package | Version | Licence |',
  '|---|---|---|',
  ...packages.map((pkg) => `| ${pkg.name} | ${pkg.version} | ${pkg.license} |`),
  '',
];
for (const pkg of packages) {
  out.push(`## ${pkg.name} ${pkg.version}`, '', `Licence: ${pkg.license}`);
  if (pkg.author !== undefined && pkg.author !== '') out.push(`Author: ${pkg.author}`);
  if (pkg.homepage !== undefined && pkg.homepage !== '') out.push(`Home: ${pkg.homepage}`);
  out.push('');
  const texts = licenceTexts(pkg.path);
  if (texts.length === 0)
    out.push('(The package carries no licence file; its licence is named above.)', '');
  for (const body of texts) out.push('```text', body, '```', '');
}
process.stdout.write(`${out.join('\n')}\n`);
