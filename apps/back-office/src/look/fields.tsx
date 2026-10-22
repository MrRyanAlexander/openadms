// The back office's own fields, beside the look's text entry (@open-adms/look): a pick of one from a
// list by name (a select), a pick of one among a few shown side by side (radios), a yes-or-no
// (a checkbox), and a day. Each is React Aria's, labelled, with a line of help and what the server
// refused of it said beneath it (WCAG 3.3.1, 3.3.2). A pick-list's values are picked, never typed
// (invariant 6).
import {
  CheckboxButton,
  CheckboxField,
  FieldError,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
  Button as Pressable,
  RadioButton,
  RadioField,
  RadioGroup,
  Select,
  SelectValue,
  Text,
  type Key,
} from 'react-aria-components';

import { words } from '../words.ts';

export interface Option {
  readonly id: string;
  readonly label: string;
}

export function SelectField({
  label,
  options,
  value,
  onChange,
  hint,
  problem,
  required = false,
  labelHidden = false,
  placeholder,
}: {
  readonly label: string;
  readonly options: readonly Option[];
  readonly value: string | null;
  readonly onChange: (value: string | null) => void;
  readonly hint?: string | undefined;
  readonly problem?: string | undefined;
  readonly required?: boolean;
  readonly labelHidden?: boolean;
  readonly placeholder?: string;
}) {
  return (
    <Select
      className="field select-field"
      value={value}
      onChange={(key: Key | null) => {
        onChange(key === null ? null : String(key));
      }}
      isInvalid={problem !== undefined}
      isRequired={required}
      validationBehavior="aria"
      placeholder={placeholder ?? words.common.pick}
    >
      <Label className={labelHidden ? 'unseen' : 'field-label'}>{label}</Label>
      <Pressable className="picker-button">
        <SelectValue />
        <span className="picker-chevron" aria-hidden="true" />
      </Pressable>
      {hint === undefined ? null : (
        <Text slot="description" className="field-hint">
          {hint}
        </Text>
      )}
      <FieldError className="field-problem">{problem}</FieldError>
      <Popover className="picker-popover">
        <ListBox className="picker-list" items={options}>
          {(option) => (
            <ListBoxItem id={option.id} textValue={option.label} className="picker-item">
              {option.label}
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </Select>
  );
}

export function ChoiceField({
  label,
  options,
  value,
  onChange,
  hint,
}: {
  readonly label: string;
  readonly options: readonly Option[];
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly hint?: string;
}) {
  return (
    <RadioGroup className="choices" orientation="horizontal" value={value} onChange={onChange}>
      <Label className="field-label">{label}</Label>
      <div className="choices-row">
        {options.map((option) => (
          <RadioField key={option.id} value={option.id}>
            <RadioButton className="choice">{option.label}</RadioButton>
          </RadioField>
        ))}
      </div>
      {hint === undefined ? null : (
        <Text slot="description" className="field-hint">
          {hint}
        </Text>
      )}
    </RadioGroup>
  );
}

export function CheckField({
  label,
  value,
  onChange,
  hint,
}: {
  readonly label: string;
  readonly value: boolean;
  readonly onChange: (value: boolean) => void;
  readonly hint?: string;
}) {
  return (
    <CheckboxField className="check-field" isSelected={value} onChange={onChange}>
      <CheckboxButton className="check">
        <span className="check-box" aria-hidden="true">
          {value ? '✓' : ''}
        </span>
        <span>{label}</span>
      </CheckboxButton>
      {hint === undefined ? null : (
        <Text slot="description" className="field-hint">
          {hint}
        </Text>
      )}
    </CheckboxField>
  );
}
