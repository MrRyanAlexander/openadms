// Text entry (ADR-561 (6)): its label, the field, and a line of help beneath it where the screen
// gives one, each tied to the field for a screen reader. A secret (a password, the master
// passcode) is never shown, and no field corrects, suggests or capitalises what is typed into it.
// A sign-in's fields name what they are, so a password manager fills them (AC-11-63); every other
// field asks the browser to fill nothing. A number copied off paper (a scale receipt's weight)
// opens the phone's keyboard of digits and a point, and a whole number (a box's inches) its keyboard
// of digits alone (ADR-585). A field whose record keeps so many characters
// takes no more (C127). **What the server refused** of a field is said beneath it (`problem`): the
// field is marked invalid and described by those words (WCAG 3.3.1), never by colour alone.
import { FieldError, Input, Label, Text, TextField } from 'react-aria-components';

export function TextEntry({
  label,
  value,
  onChange,
  hint,
  secret = false,
  autoComplete = 'off',
  decimal = false,
  whole = false,
  longest,
  problem,
  required = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly hint?: string;
  readonly secret?: boolean;
  readonly autoComplete?:
    'off' | 'username' | 'email' | 'current-password' | 'new-password' | 'one-time-code';
  readonly decimal?: boolean;
  readonly whole?: boolean;
  readonly longest?: number;
  readonly problem?: string | undefined;
  readonly required?: boolean;
}) {
  return (
    <TextField
      className="field"
      value={value}
      onChange={onChange}
      type={secret ? 'password' : 'text'}
      isInvalid={problem !== undefined}
      isRequired={required}
      validationBehavior="aria"
    >
      <Label className="field-label">{label}</Label>
      <Input
        className="field-input"
        autoComplete={autoComplete}
        {...(decimal ? { inputMode: 'decimal' as const } : {})}
        {...(whole ? { inputMode: 'numeric' as const } : {})}
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
      <FieldError className="field-problem">{problem}</FieldError>
    </TextField>
  );
}
