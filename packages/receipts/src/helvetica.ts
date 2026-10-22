// How wide words are in the two fonts every PDF reader carries (ISO 32000 §9.6.2.2, the standard
// 14): Helvetica and Helvetica-Bold, from Adobe's own font metrics, in thousandths of the size.
// What a page lays out by: a column's numbers set to its right, a title set to its middle, a line
// cut where it would run past its box. A character WinAnsi lacks is drawn as "?", and measured so.

// Printable ASCII from the space (32) to the tilde (126), in order.
// prettier-ignore
const regular = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
] as const;

// prettier-ignore
const bold = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
] as const;

// The few WinAnsi characters above ASCII a report prints, each as wide as its font says.
const beyond: Readonly<Record<string, readonly [number, number]>> = {
  '–': [556, 556],
  '—': [1000, 1000],
  '‘': [222, 278],
  '’': [222, 278],
  '“': [333, 500],
  '”': [333, 500],
  '•': [350, 350],
  '…': [1000, 1000],
  '×': [584, 584],
  '°': [400, 400],
  '·': [278, 278],
  '½': [834, 834],
  '¼': [834, 834],
  '¾': [834, 834],
};

// How wide `words` are, in points, at `size`.
export function textWidth(words: string, size: number, isBold = false): number {
  const table = isBold ? bold : regular;
  let thousandths = 0;
  for (const character of words.normalize('NFC')) {
    const code = character.codePointAt(0) ?? 0;
    const other = beyond[character];
    thousandths +=
      code >= 32 && code <= 126
        ? (table[code - 32] ?? 556)
        : other !== undefined
          ? other[isBold ? 1 : 0]
          : (table[0x3f - 32] ?? 556);
  }
  return (thousandths * size) / 1000;
}

// The words cut to fit `width` points, an ellipsis where any were cut.
export function fitted(words: string, size: number, width: number, isBold = false): string {
  if (textWidth(words, size, isBold) <= width) return words;
  const characters = Array.from(words);
  while (characters.length > 0 && textWidth(`${characters.join('')}…`, size, isBold) > width) {
    characters.pop();
  }
  return characters.length === 0 ? '' : `${characters.join('').trimEnd()}…`;
}

// The words broken into lines no wider than `width` points, at spaces; a word wider than a line
// alone is cut to fit it.
export function linesOf(words: string, size: number, width: number, isBold = false): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of words.split(/\s+/).filter((each) => each !== '')) {
    const tried = line === '' ? word : `${line} ${word}`;
    if (textWidth(tried, size, isBold) <= width) {
      line = tried;
      continue;
    }
    if (line !== '') lines.push(line);
    line = textWidth(word, size, isBold) <= width ? word : fitted(word, size, width, isBold);
  }
  if (line !== '') lines.push(line);
  return lines;
}
