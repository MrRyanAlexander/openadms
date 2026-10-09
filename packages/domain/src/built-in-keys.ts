// The built-in values of the firm's lists (spec/LISTS.md, "Built-in values plus the firm's own";
// ADR-194, 302). The firm adds, renames and archives its own values freely; the system acts only on
// the values named here, and knows each by its fixed key, never by its name, so a rename changes
// nothing it does. This is the one place the keys are written: the seed in packages/db may write no
// other, and a test holds the database to exactly this set.
//
// A new key is a release: a code change with an ADR saying what the system does for it. A list
// that isn't named here has no built-in value.
export const builtInKeys = {
  // The kind of unit rate work whose screen takes the stump readings and works out the fill
  // (ADR-198).
  kindOfWork: ['STUMPS'],
  // A haul-out only ever leaves a TDSR, so one dumped at a TDSR is flagged (ADR-226, 298); a final
  // disposal site is where a scale receipt's number may be taken (ADR-227).
  siteType: ['TDSR', 'FINAL_DISPOSAL'],
  // A post-work survey finds its pre-work survey (ADR-150); an ROE is its own record (ADR-149).
  surveyWorkType: ['PRE_WORK', 'POST_WORK', 'ROE'],
} as const;

// A list that has built-in values.
export type ListWithBuiltInValues = keyof typeof builtInKeys;

// The keys of one such list: BuiltInKey<'siteType'> is 'TDSR' | 'FINAL_DISPOSAL'.
export type BuiltInKey<List extends ListWithBuiltInValues = ListWithBuiltInValues> =
  (typeof builtInKeys)[List][number];
