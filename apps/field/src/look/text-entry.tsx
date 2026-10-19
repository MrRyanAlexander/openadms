// Text entry (ADR-561 (6)): its label, the field, and a line of help beneath it where the screen
// gives one, each tied to the field for a screen reader. A secret (a password, the master
// passcode) is never shown, and no field corrects, suggests or capitalises what is typed into it.
// A sign-in's fields name what they are, so a password manager fills them (AC-11-63); every other
// field asks the browser to fill nothing. A number copied off paper (a scale receipt's weight)
// opens the phone's keyboard of digits and a point. A field whose record keeps so many characters
// takes no more (C127).
import { Input, Label, Text, TextField } from 'react-aria-components';

export function TextEntry({
  label,
  value,
  onChange,
  hint,
  secret = false,
  autoComplete = 'off',
  decimal = false,
  longest,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly hint?: string;
  readonly secret?: boolean;
  readonly autoComplete?: 'off' | 'username' | 'current-password';
  readonly decimal?: boolean;
  readonly longest?: number;
}) {
  return (
    <TextField
      className="field"
      value={value}
      onChange={onChange}
      type={secret ? 'password' : 'text'}
    >
      <Label className="field-label">{label}</Label>
      <Input
        className="field-input"
        autoComplete={autoComplete}
        {...(decimal ? { inputMode: 'decimal' as const } : {})}
        {...(longest === undefined ? {} : { maxLength: longest })}
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
      />
      {hint === undefined ? null : (
        <Text slot="description" className="field-hint">
          {hint}
        </Text>
      )}
    </TextField>
  );
}
