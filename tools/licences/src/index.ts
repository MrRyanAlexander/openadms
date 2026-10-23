// Checks every installed package's licence against Apache-2.0 compatibility (the user, 2026-10-23,
// Apache-2.0, superseding ADR-171; ADR-258 for the check itself).
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
  // Compatible with Apache-2.0 for what ships: permissive licences, and MPL-2.0 (weak, file-level
  // copyleft, used unmodified). SPDX identifiers.
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
    'MPL-2.0',
  ]);

  // Refused: strong and network copyleft (GPL, LGPL, AGPL, including SPDX's unsuffixed spellings),
  // which can't ship inside an Apache-2.0 work; source-available and non-commercial licences too.
  static readonly refused = [
    /^GPL-/,
    /^LGPL-/,
    /^AGPL-/,
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
    // libvips (LGPL-3.0-or-later), the prebuilt binary sharp loads, in the docs site's build (Astro):
    // a build-time tool for static pages, never in the product that ships (the user, 2026-10-23).
    ['@img/sharp-libvips-darwin-arm64@1.3.4', 'LGPL-3.0-or-later'],
    ['@img/sharp-libvips-linux-arm64@1.3.4', 'LGPL-3.0-or-later'],
    ['@img/sharp-libvips-linux-x64@1.3.4', 'LGPL-3.0-or-later'],
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
