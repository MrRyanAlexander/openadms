// What a firm calls its ADMS (the user, 2026-10-22: "we want to ask them what they want to call
// their ADMS … let the firm put their own white label on it at setup. This would then brand it for
// them"). The name is the firm's own words for the installation, shown to its people and its
// clients on every screen and in what the server writes for them: plain text, one to forty
// characters once trimmed, the one rule the installer, the contracts, the seed and the database's
// check all hold. It is no secret. Beside it, every screen and document says which Open ADMS it is
// built on (the AGPL-3.0 attribution), whose name and version are not the firm's to change.

// The name an installation starts with, and keeps when the firm never gives one: the product's.
export const startingBrandName = 'Open ADMS';

export const brandNameLength = { shortest: 1, longest: 40 } as const;

// What a person typed, trimmed; undefined when it is not a name: empty, longer than the most it
// may be, or holding a control character.
export function readBrandName(typed: string): string | undefined {
  const name = typed.trim();
  // eslint-disable-next-line no-control-regex -- a control character in a name is what is refused
  if (/[\u0000-\u001f\u007f]/.test(name)) return undefined;
  return name.length >= brandNameLength.shortest && name.length <= brandNameLength.longest
    ? name
    : undefined;
}

// What the question offers when the firm names none: "<firm> ADMS", or the product's own name where
// the firm's is too long to take it.
export function suggestedBrandName(firm: string): string {
  return readBrandName(`${firm.trim()} ADMS`) ?? startingBrandName;
}

// Which Open ADMS an installation is built on, wherever a firm's brand is shown: the AGPL-3.0
// attribution, and (§13) where the people using it over a network can get the source. The version
// is the release's, from the repository's root package.json.
export const builtOn = {
  product: 'Open ADMS',
  licence: 'AGPL-3.0',
  // Where the source is: the repository this release is built from (the one address, here; the
  // firm that publishes its own build changes it with the build).
  source: 'https://github.com/MrRyanAlexander/openadms_dev',
} as const;

export function builtOnLine(version: string): string {
  return `Built on ${builtOn.product} ${version}`;
}
