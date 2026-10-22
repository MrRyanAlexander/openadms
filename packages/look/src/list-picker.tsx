// The list picker (ADR-561 (5), (6)): a pick by name, never a code (invariant 20), as large rows,
// in the order the screen gives them (the most used first), with a search once the list is long.
// React Aria's list box: one tap picks, the picked row says so by a tick and its state, and a
// screen reader hears each row's name and whether it is picked. **Where a pick moves straight on**
// to the next question (ADR-573 (1)), the question's line beneath its title says so first, "Pick
// one to go on." (WCAG 3.2.2; BUILD.md, settled 7), and the list is described by it.
import { useId, useState } from 'react';
import { Input, Label, ListBox, ListBoxItem, SearchField, useFilter } from 'react-aria-components';

import { look } from './translation.ts';
import { Tick } from './icons.tsx';

export interface Choice {
  readonly key: string;
  readonly label: string;
  readonly detail?: string;
}

// How long a list is before it offers a search: about what one phone screen shows.
const searchFrom = 8;

export function ListPicker({
  labelledBy,
  choices,
  picked,
  onPick,
  movesOn = false,
}: {
  // The id of the screen's question, which names the list.
  readonly labelledBy: string;
  readonly choices: readonly Choice[];
  readonly picked: string | null;
  readonly onPick: (key: string) => void;
  // A pick goes on to the next question at once.
  readonly movesOn?: boolean;
}) {
  const lineId = useId();
  const rows = (
    <Rows
      labelledBy={labelledBy}
      describedBy={movesOn ? lineId : undefined}
      choices={choices}
      picked={picked === null ? [] : [picked]}
      onPicked={(keys) => {
        for (const key of keys) onPick(key);
      }}
      many={false}
    />
  );
  if (!movesOn) return rows;
  return (
    <>
      <p id={lineId} className="field-hint">
        {look.words.pickToGoOn}
      </p>
      {rows}
    </>
  );
}

// The same rows where several may be picked (a setup's work, ADR-576): each tap picks a row or
// lets it go, and a screen reader hears each row's name and whether it is picked.
export function ListPicks({
  labelledBy,
  choices,
  picked,
  onPicked,
}: {
  readonly labelledBy: string;
  readonly choices: readonly Choice[];
  readonly picked: readonly string[];
  readonly onPicked: (keys: readonly string[]) => void;
}) {
  return (
    <Rows labelledBy={labelledBy} choices={choices} picked={picked} onPicked={onPicked} many />
  );
}

function Rows({
  labelledBy,
  describedBy,
  choices,
  picked,
  onPicked,
  many,
}: {
  readonly labelledBy: string;
  readonly describedBy?: string | undefined;
  readonly choices: readonly Choice[];
  readonly picked: readonly string[];
  readonly onPicked: (keys: readonly string[]) => void;
  readonly many: boolean;
}) {
  const { contains } = useFilter({ sensitivity: 'base' });
  const [search, setSearch] = useState('');
  const shown = choices.filter((choice) => contains(choice.label, search));
  return (
    <div className="list-picker">
      {choices.length < searchFrom ? null : (
        <SearchField className="field" value={search} onChange={setSearch}>
          <Label className="field-label">{look.words.search}</Label>
          <Input className="field-input" />
        </SearchField>
      )}
      <ListBox
        aria-labelledby={labelledBy}
        {...(describedBy === undefined ? {} : { 'aria-describedby': describedBy })}
        className="list-picker-rows"
        items={shown}
        selectionMode={many ? 'multiple' : 'single'}
        disallowEmptySelection={!many}
        selectedKeys={picked}
        onSelectionChange={(selection) => {
          onPicked(
            selection === 'all' ? choices.map(({ key }) => key) : [...selection].map(String),
          );
        }}
        renderEmptyState={() => <p className="quiet">{look.words.nothingFound}</p>}
      >
        {(choice) => (
          <ListBoxItem id={choice.key} textValue={choice.label} className="list-picker-row">
            <span className="list-row-words">
              <span className="list-row-label">{choice.label}</span>
              {choice.detail === undefined ? null : (
                <span className="list-row-detail">{choice.detail}</span>
              )}
            </span>
            <Tick className="icon-picked" />
          </ListBoxItem>
        )}
      </ListBox>
    </div>
  );
}
