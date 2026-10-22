// The back office's own fields, beside the look's text entry (@open-adms/look): a pick of one from a
// list by name (a select), a pick of one among a few shown side by side (radios), a yes-or-no
// (a checkbox), and a day. Each is React Aria's, labelled, with a line of help and what the server
// refused of it said beneath it (WCAG 3.3.1, 3.3.2). A pick-list's values are picked, never typed
// (invariant 6).
import { useId } from 'react';
import {
  CheckboxButton,
  CheckboxField,
  CheckboxGroup,
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
  TextArea,
  TextField,
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
        <span className="check-box" aria-hidden="true" />
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

// Several picked from a short list: one checkbox each, the group labelled (WCAG 1.3.1).
export function ChecksField({
  label,
  options,
  value,
  onChange,
  hint,
}: {
  readonly label: string;
  readonly options: readonly Option[];
  readonly value: readonly string[];
  readonly onChange: (value: readonly string[]) => void;
  readonly hint?: string | undefined;
}) {
  return (
    <CheckboxGroup className="choices" value={[...value]} onChange={onChange}>
      <Label className="field-label">{label}</Label>
      <div className="checks-row">
        {options.map((option) => (
          <CheckboxField key={option.id} value={option.id} className="check-field">
            <CheckboxButton className="check">
              <span className="check-box" aria-hidden="true" />
              <span>{option.label}</span>
            </CheckboxButton>
          </CheckboxField>
        ))}
      </div>
      {hint === undefined ? null : (
        <Text slot="description" className="field-hint">
          {hint}
        </Text>
      )}
    </CheckboxGroup>
  );
}

// A calendar day, in the browser's own date field (no date library): 2026-10-12 as the API takes
// it. Read as a day only, never as an instant.
export function DateEntry({
  label,
  value,
  onChange,
  hint,
  problem,
  required = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly hint?: string | undefined;
  readonly problem?: string | undefined;
  readonly required?: boolean;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const problemId = `${id}-problem`;
  const described = [hint === undefined ? null : hintId, problem === undefined ? null : problemId]
    .filter((part) => part !== null)
    .join(' ');
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="field-input field-date"
        type="date"
        value={value}
        required={required}
        aria-invalid={problem === undefined ? undefined : true}
        {...(described === '' ? {} : { 'aria-describedby': described })}
        onChange={(event) => {
          onChange(event.currentTarget.value);
        }}
      />
      {hint === undefined ? null : (
        <p id={hintId} className="field-hint">
          {hint}
        </p>
      )}
      {problem === undefined ? null : (
        <p id={problemId} className="field-problem">
          {problem}
        </p>
      )}
    </div>
  );
}

// A few lines of text: notes, or a pick's choices one per line.
export function TextBlock({
  label,
  value,
  onChange,
  hint,
  longest,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly hint?: string;
  readonly longest?: number;
}) {
  return (
    <TextField className="field" value={value} onChange={onChange}>
      <Label className="field-label">{label}</Label>
      <TextArea
        className="field-input field-text"
        rows={4}
        {...(longest === undefined ? {} : { maxLength: longest })}
      />
      {hint === undefined ? null : (
        <Text slot="description" className="field-hint">
          {hint}
        </Text>
      )}
    </TextField>
  );
}

// A file picked from the person's computer (a map's file): the browser's own file field, labelled;
// the file handed to the screen as it is picked.
export function FileField({
  label,
  accept,
  busy = false,
  onFile,
}: {
  readonly label: string;
  readonly accept: string;
  readonly busy?: boolean;
  readonly onFile: (file: File) => void;
}) {
  const id = useId();
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="field-file"
        type="file"
        accept={accept}
        aria-busy={busy}
        onChange={(event) => {
          const chosen = event.currentTarget.files?.[0];
          if (chosen !== undefined) onFile(chosen);
        }}
      />
    </div>
  );
}
