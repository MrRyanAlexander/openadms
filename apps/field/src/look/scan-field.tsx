// The scan field (ADR-561 (6)): a badge's or a ticket's number, scanned or typed. The field takes
// a paste, and never corrects, suggests or learns what is typed into it. A number typed because the
// barcode won't read is the screen's to mark.
//
// Scanning (task 3.6.3; AC-11-49; ADR-596):
// - **A keyboard-style Bluetooth scanner** types the number and ends with Enter. Into the field
//   where it has the focus; and **wherever else on the screen the focus is**, outside any other
//   field or a dialog, what it types goes into this field from its first key (a new scan starts
//   the field afresh) and its Enter takes it, so the monitor needn't tap the field first. Nothing
//   is timed or guessed: keys typed by hand outside a field are taken the same way. **A phone
//   setting turns this off** (WCAG 2.1.4; BUILD.md, settled 7): "Take a scanner's keys anywhere
//   on the screen", on by default, given here by `ScannerKeysAnywhere`; off, keys go only into
//   the field that has the focus.
// - **The Scan button** opens the camera's scanner (`scan.tsx`), which the screen gives.
// - **`keyboard={false}`** (a ticket's number, where "The barcode won't read" takes a typed one):
//   the field opens no keyboard on a phone, so a number comes by a scanner, the camera or a paste,
//   and one typed by hand goes the way that is flagged with its reason (Q-105, ADR-111).
import { createContext, useContext, useEffect, useRef } from 'react';
import { Input, Label, TextField } from 'react-aria-components';

import { words } from '../words.ts';
import { Button } from './button.tsx';
import { Barcode } from './icons.tsx';

// Where a key typed belongs to something else: another field, or a dialog over the screen.
const elsewhere = 'input, textarea, select, [contenteditable="true"], [role="dialog"]';

// The phone's setting "Take a scanner's keys anywhere on the screen" (`PhoneSettings`), on unless a
// screen above says otherwise.
export const ScannerKeysAnywhere = createContext(true);

export function ScanField({
  label,
  value,
  onChange,
  onScan,
  onEnter,
  keyboard = true,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onScan: () => void;
  // Enter, with what the field holds then.
  readonly onEnter?: (value: string) => void;
  readonly keyboard?: boolean;
}) {
  // What the field holds and what to tell, as of the last render, for the keys typed elsewhere.
  const now = useRef({ value, onChange, onEnter });
  now.current = { value, onChange, onEnter };
  const anywhere = useContext(ScannerKeysAnywhere);
  useEffect(() => {
    if (!anywhere) return;
    // Whether the keys typed since the last Enter came here from elsewhere on the screen.
    let catching = false;
    const pressed = (key: KeyboardEvent) => {
      if (key.ctrlKey || key.metaKey || key.altKey || key.isComposing) return;
      const at = key.target;
      if (at instanceof Element && at.closest(elsewhere) !== null) {
        catching = false;
        return;
      }
      const held = now.current;
      if (key.key === 'Enter') {
        if (!catching) return;
        catching = false;
        key.preventDefault();
        key.stopPropagation();
        held.onEnter?.(held.value);
        return;
      }
      if (key.key.length !== 1 || key.key === ' ') return;
      key.preventDefault();
      key.stopPropagation();
      const typed = catching ? held.value + key.key : key.key;
      catching = true;
      // Kept at once, so a scanner's next key, before the screen draws again, adds to it.
      now.current = { ...held, value: typed };
      held.onChange(typed);
    };
    document.addEventListener('keydown', pressed, true);
    return () => {
      document.removeEventListener('keydown', pressed, true);
    };
  }, [anywhere]);
  return (
    <div className="scan-field">
      <TextField className="field" value={value} onChange={onChange}>
        <Label className="field-label">{label}</Label>
        <Input
          className="field-input field-input-number"
          inputMode={keyboard ? 'numeric' : 'none'}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="done"
          onKeyDown={(pressed) => {
            if (pressed.key === 'Enter') onEnter?.(pressed.currentTarget.value);
          }}
        />
      </TextField>
      <Button icon={<Barcode />} onPress={onScan}>
        {words.look.scan}
      </Button>
    </div>
  );
}
