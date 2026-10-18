// Every word a screen shows comes from the translation file (ADR-172; AC-11-04): English first,
// in US units. A screen names a word by its place in the file; a word missing from it doesn't
// compile. Another language is another file of the same shape.
import english from './words/en.json';

export type Words = typeof english;

export const words: Words = english;
