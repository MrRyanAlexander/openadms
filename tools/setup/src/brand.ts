// What the firm calls its ADMS, asked at the first run (the user, 2026-10-22: "when a firm runs
// the setup questions, we want to ask them what they want to call their ADMS … let the firm put
// their own white label on it at setup"). The rule is the domain's (packages/domain/src/brand.ts,
// `BrandName`): plain text, one to forty characters once trimmed, no control character. The
// installer runs before anything is built, so it can't import the domain; it holds the same two
// numbers, and test/brand.test.ts holds them to the domain's source. The seed and the database
// check the name again, so a drift here could only ever ask the question twice, never save a name
// the rule refuses.
export const brandNameLength = { shortest: 1, longest: 40 } as const;

export const brandProblem = `A name is ${String(brandNameLength.shortest)} to ${String(brandNameLength.longest)} characters, with no control character in it.`;

// What a person typed, trimmed; undefined when it is no name.
export function readBrandName(typed: string): string | undefined {
  const name = typed.trim();
  // eslint-disable-next-line no-control-regex -- a control character in a name is what is refused
  if (/[\u0000-\u001f\u007f]/.test(name)) return undefined;
  return name.length >= brandNameLength.shortest && name.length <= brandNameLength.longest
    ? name
    : undefined;
}

// What the question offers when the firm says nothing: "<firm> ADMS", or the product's own name
// where the firm's is too long to take it.
export function suggestedBrandName(firm: string): string {
  return readBrandName(`${firm.trim()} ADMS`) ?? 'Open ADMS';
}

// The question, asked until the answer is a name. `ask` is the interview's, with its fallback for
// an empty answer; `tell` says why an answer was not taken.
export async function askBrandName(
  ask: (question: string, fallback: string) => Promise<string>,
  firm: string,
  tell: (line: string) => void,
): Promise<string> {
  const suggested = suggestedBrandName(firm);
  for (;;) {
    const name = readBrandName(
      await ask('2. What do you call your ADMS? (what your people and clients see)', suggested),
    );
    if (name !== undefined) return name;
    tell(`   ${brandProblem}`);
  }
}
