// The list picker (ADR-561 (5), (6)): a pick by name, never a code (invariant 20), as large rows,
// in the order the screen gives them (the most used first), with a search once the list is long.
// React Aria's list box: one tap picks, the picked row says so by a tick and its state, and a
// screen reader hears each row's name and whether it is picked.
import { useState } from 'react';
import { Input, Label, ListBox, ListBoxItem, SearchField, useFilter } from 'react-aria-components';

import { words } from '../words.ts';
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
}: {
  // The id of the screen's question, which names the list.
  readonly labelledBy: string;
  readonly choices: readonly Choice[];
  readonly picked: string | null;
  readonly onPick: (key: string) => void;
}) {
  const { contains } = useFilter({ sensitivity: 'base' });
  const [search, setSearch] = useState('');
  const shown = choices.filter((choice) => contains(choice.label, search));
  return (
    <div className="list-picker">
      {choices.length < searchFrom ? null : (
        <SearchField className="field" value={search} onChange={setSearch}>
          <Label className="field-label">{words.look.search}</Label>
          <Input className="field-input" />
        </SearchField>
      )}
      <ListBox
        aria-labelledby={labelledBy}
        className="list-picker-rows"
        items={shown}
        selectionMode="single"
        disallowEmptySelection
        selectedKeys={picked === null ? [] : [picked]}
        onSelectionChange={(selection) => {
          if (selection === 'all') return;
          for (const key of selection) onPick(String(key));
        }}
        renderEmptyState={() => <p className="quiet">{words.look.nothingFound}</p>}
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
