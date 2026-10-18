// The rules the accessibility check runs (BACKLOG 3.1.3; ADR-566; AC-11-51): WCAG 2.0, 2.1 and 2.2
// at A and AA, as axe-core tags its rules. WCAG 2.2 adds no A criterion axe-core can test (3.2.6
// and 3.3.7 are the hand review's, 3.10.2); 4.1.1, gone from 2.2, is tagged `wcag2a-obsolete` and
// not run. Its experimental rules among them run too (1.3.4's orientation lock is one): a finding
// of one is read like any other.
import axe from 'axe-core';

export const wcagLevels = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
export const rules = axe
  .getRules(wcagLevels)
  .map((rule) => rule.ruleId)
  .sort();
