// A setting turned on or off (BUILD.md, settled 7): a switch, its label beside it and its state in
// words as well as in its look, never colour alone (ADR-561 (3)). As tall as a main button.
import { SwitchButton, SwitchField } from 'react-aria-components';

import { look } from './translation.ts';

export function Toggle({
  label,
  on,
  onChange,
}: {
  readonly label: string;
  readonly on: boolean;
  readonly onChange: (on: boolean) => void;
}) {
  return (
    <SwitchField isSelected={on} onChange={onChange}>
      <SwitchButton className="toggle">
        <span className="toggle-track" aria-hidden="true">
          <span className="toggle-knob" />
        </span>
        <span className="toggle-label">{label}</span>
        <span className="toggle-state" aria-hidden="true">
          {on ? look.words.on : look.words.off}
        </span>
      </SwitchButton>
    </SwitchField>
  );
}
