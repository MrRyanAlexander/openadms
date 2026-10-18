// The scan field (ADR-561 (6)): a badge's or a ticket's number, scanned or typed. A keyboard-style
// Bluetooth scanner types into the field and ends with Enter; the Scan button opens the camera's
// scanner (task 3.6.3). The field takes a paste, and never corrects, suggests or learns what is
// typed into it. A number typed because the barcode won't read is the screen's to mark.
import { Input, Label, TextField } from 'react-aria-components';

import { words } from '../words.ts';
import { Button } from './button.tsx';
import { Barcode } from './icons.tsx';

export function ScanField({
  label,
  value,
  onChange,
  onScan,
  onEnter,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onScan: () => void;
  readonly onEnter?: () => void;
}) {
  return (
    <div className="scan-field">
      <TextField className="field" value={value} onChange={onChange}>
        <Label className="field-label">{label}</Label>
        <Input
          className="field-input field-input-number"
          inputMode="numeric"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="done"
          onKeyDown={(pressed) => {
            if (pressed.key === 'Enter') onEnter?.();
          }}
        />
      </TextField>
      <Button icon={<Barcode />} onPress={onScan}>
        {words.look.scan}
      </Button>
    </div>
  );
}
