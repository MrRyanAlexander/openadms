// The one translation layer (ARCHITECTURE §14; ADR-172): every word a screen shows comes from its
// app's translation file, English first, in US units. A screen names a word by its place in the
// file; a word missing from it doesn't compile. Another language is another file of the same shape.
// A word with a gap in it (`{count}`) is filled by `say`; one that changes with a number is picked
// by `counted`. Each app makes one `Translation` of its own file; the look's components have their
// own few words (words/en.json).
import lookEnglish from './words/en.json' with { type: 'json' };

// What every translation file holds: the language it is in, as a BCP 47 tag.
export interface WordsFile {
  readonly language: string;
}

// The forms of a word that changes with a number: `none` for nothing where the file has one.
export interface CountedForms {
  readonly none?: string;
  readonly one: string;
  readonly other: string;
}

export class Translation<Words extends WordsFile> {
  readonly words: Words;
  private readonly numbers: Intl.NumberFormat;
  private readonly plurals: Intl.PluralRules;

  constructor(words: Words) {
    this.words = words;
    this.numbers = new Intl.NumberFormat(words.language);
    this.plurals = new Intl.PluralRules(words.language);
  }

  // A word with its gaps filled. A gap the word names and the caller doesn't fill is a mistake in
  // the screen, never shown as `{name}`.
  readonly say = (word: string, filling: Readonly<Record<string, string | number>>): string =>
    word.replace(/\{(\w+)\}/g, (_gap, name: string) => {
      const value = filling[name];
      if (value === undefined) throw new Error(`"${word}" has a gap {${name}} nobody filled.`);
      return typeof value === 'number' ? this.numbers.format(value) : value;
    });

  // The word for a count: `none` for nothing where the file has one, else the language's own form.
  readonly counted = (
    forms: CountedForms,
    count: number,
    filling: Readonly<Record<string, string | number>> = {},
  ): string => {
    const form =
      count === 0 && forms.none !== undefined
        ? forms.none
        : this.plurals.select(count) === 'one'
          ? forms.one
          : forms.other;
    return this.say(form, { count, ...filling });
  };

  // A number as the language writes it: 5,548.25.
  readonly number = (value: number, fractionDigits?: number): string =>
    fractionDigits === undefined
      ? this.numbers.format(value)
      : new Intl.NumberFormat(this.words.language, {
          minimumFractionDigits: fractionDigits,
          maximumFractionDigits: fractionDigits,
        }).format(value);
}

// The look's own words, for its components.
export const look = new Translation(lookEnglish);
