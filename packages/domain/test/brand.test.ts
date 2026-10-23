// What a firm calls its ADMS, and the line that says which Open ADMS it is built on.
import { describe, expect, it } from 'vitest';

import {
  builtOn,
  builtOnLine,
  readBrandName,
  startingBrandName,
  suggestedBrandName,
} from '../src/index.ts';

describe('what a firm calls its ADMS', () => {
  it('is plain text of one to forty characters once trimmed, and the trimmed text is what is kept', () => {
    expect(readBrandName('  Gates ADMS ')).toBe('Gates ADMS');
    expect(readBrandName('G')).toBe('G');
    expect(readBrandName('x'.repeat(40))).toBe('x'.repeat(40));
    expect(readBrandName('Gates Disaster Recovery’s ADMS – Bayline')).toBeDefined();
  });

  it('is refused empty, blank, over forty characters, or holding a control character', () => {
    expect(readBrandName('')).toBeUndefined();
    expect(readBrandName('   ')).toBeUndefined();
    expect(readBrandName('x'.repeat(41))).toBeUndefined();
    expect(readBrandName('   ' + 'x'.repeat(41))).toBeUndefined();
    expect(readBrandName('Gates\nADMS')).toBeUndefined();
    expect(readBrandName('Gates\u0000ADMS')).toBeUndefined();
  });

  it('starts as the product’s own name, and is suggested as "<firm> ADMS" where that fits', () => {
    expect(startingBrandName).toBe('Open ADMS');
    expect(suggestedBrandName('Gates Disaster Recovery')).toBe('Gates Disaster Recovery ADMS');
    expect(suggestedBrandName('  Gates  ')).toBe('Gates ADMS');
    // A firm name too long to take ADMS after it falls back to the product’s name.
    expect(suggestedBrandName('x'.repeat(40))).toBe(startingBrandName);
  });
});

describe('the built-on line', () => {
  it('names Open ADMS and the release, and says where the source is', () => {
    expect(builtOnLine('0.1.0')).toBe('Built on Open ADMS 0.1.0');
    expect(builtOn.licence).toBe('AGPL-3.0');
    expect(builtOn.source).toMatch(/^https:\/\/[a-z0-9.-]+\/\S+$/i);
  });
});
