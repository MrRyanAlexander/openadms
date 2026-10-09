// Checks every installed package's licence against AGPL-3.0 compatibility (ADR-171, ADR-258).
// Reads `pnpm licenses list --json` on stdin, prints one line per package and a summary, and
// exits 1 if any licence is refused or not yet decided. Run from the root: `pnpm licences`.
// Node 24 runs this file as-is (type stripping), so it uses erasable TypeScript only.
import { text } from 'node:stream/consumers';

interface InstalledPackage {
  name: string;
  versions: string[];
  license: string;
}

type Report = Record<string, InstalledPackage[]>;

type Verdict = 'allowed' | 'refused' | 'undecided';

class LicencePolicy {
  // Compatible with AGPL-3.0 (ADR-171): permissive, LGPL, GPL-3.0, AGPL-3.0.
  // SPDX identifiers; the unsuffixed GNU ones are SPDX's deprecated spellings.
  static readonly allowed = new Set([
    '0BSD',
    'Apache-2.0',
    'BlueOak-1.0.0',
    'BSD-2-Clause',
    'BSD-3-Clause',
    'CC0-1.0',
    'ISC',
    'MIT',
    'MIT-0',
    'Python-2.0',
    'Unlicense',
    'Zlib',
    'LGPL-2.1',
    'LGPL-2.1-only',
    'LGPL-2.1-or-later',
    'LGPL-3.0',
    'LGPL-3.0-only',
    'LGPL-3.0-or-later',
    'GPL-3.0',
    'GPL-3.0-only',
    'GPL-3.0-or-later',
    'AGPL-3.0',
    'AGPL-3.0-only',
    'AGPL-3.0-or-later',
    // MPL-2.0 names AGPL-3.0 as a Secondary License (§1.12, §3.3) (ADR-260, 262).
    'MPL-2.0',
  ]);

  // Source-available and non-commercial licences are refused (ADR-171).
  static readonly refused = [
    /^BUSL-/,
    /^SSPL-/,
    /^Elastic-/,
    /^PolyForm-/,
    /-NC(-|$)/,
    /Commons[- ]Clause/i,
  ];

  // Packages decided one by one, by exact version: a new version is undecided again until checked.
  // Only for tools that never ship, the licence rule being about what ships (ADR-262).
  static readonly allowedByName = new Map([
    // EPL-2.0, in Prisma Studio, inside the Prisma CLI: a dev tool (ADR-267).
    ['elkjs@0.11.1', 'EPL-2.0'],
    // Declared "MIT and ISC" (not SPDX's upper-case AND); both allowed. Prisma Studio (ADR-267).
    ['@visx/vendor@4.0.0-alpha.0', 'MIT and ISC'],
    // In secretlint, the secrets scan in tools/security: a dev tool, never shipped (ADR-276).
    ['@azu/style-format@1.0.1', 'WTFPL'],
    ['binaryextensions@6.11.0', 'Artistic-2.0'],
    ['editions@6.22.0', 'Artistic-2.0'],
    ['istextorbinary@9.5.0', 'Artistic-2.0'],
    ['textextensions@6.11.0', 'Artistic-2.0'],
    ['version-range@4.15.0', 'Artistic-2.0'],
    // The SPDX exception list as data, read by secretlint's package-metadata parsing (ADR-276).
    ['spdx-exceptions@2.5.0', 'CC-BY-3.0'],
  ]);

  // Anything else is undecided: a person decides it in an ADR before it is pinned.
  verdict(expression: string, pkg?: string): Verdict {
    if (pkg !== undefined && LicencePolicy.allowedByName.get(pkg) === expression) return 'allowed';
    const expr = expression.trim().replace(/^\((.*)\)$/, '$1');
    if (/\sOR\s/.test(expr)) {
      const each = expr.split(/\s+OR\s+/).map((part) => this.verdict(part));
      if (each.includes('allowed')) return 'allowed';
      return each.includes('undecided') ? 'undecided' : 'refused';
    }
    if (/\sAND\s/.test(expr)) {
      const each = expr.split(/\s+AND\s+/).map((part) => this.verdict(part));
      if (each.includes('refused')) return 'refused';
      return each.every((v) => v === 'allowed') ? 'allowed' : 'undecided';
    }
    if (LicencePolicy.refused.some((pattern) => pattern.test(expr))) return 'refused';
    return LicencePolicy.allowed.has(expr) ? 'allowed' : 'undecided';
  }
}

const report = JSON.parse(await text(process.stdin)) as Report;
const policy = new LicencePolicy();
const counts: Record<Verdict, number> = { allowed: 0, refused: 0, undecided: 0 };

const lines = Object.values(report)
  .flat()
  .flatMap((pkg) => pkg.versions.map((version) => ({ ...pkg, version })))
  .sort((a, b) => a.name.localeCompare(b.name));

for (const pkg of lines) {
  const verdict = policy.verdict(pkg.license, `${pkg.name}@${pkg.version}`);
  counts[verdict] += 1;
  console.log(`${verdict.padEnd(9)} ${pkg.license.padEnd(22)} ${pkg.name}@${pkg.version}`);
}

console.log(
  `\n${String(lines.length)} packages: ${String(counts.allowed)} allowed, ` +
    `${String(counts.refused)} refused, ${String(counts.undecided)} undecided.`,
);
if (counts.refused > 0 || counts.undecided > 0) process.exitCode = 1;
