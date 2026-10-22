// The number keypad (ADR-561 (6)): a number typed on keys as large as a gloved thumb, with no
// picker, no steps and no suggestion (a load call is typed, ADR-111). The phone's own keyboard
// stays closed, so nothing covers the screen (WCAG 2.4.11). The value is a live region: a screen
// reader hears it as it changes. A key's name holds what it shows (WCAG 2.5.3): the point is "."
// with its name beside it, unseen. What the number may be is the screen's to say, from the rules;
// the keypad only stops at as many digits as it is given.
import { Button as Pressable } from 'react-aria-components';

import { words } from '../words.ts';
import { Erase } from '@open-adms/look';

const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

export function NumberKeypad({
  labelledBy,
  value,
  onChange,
  digitsAtMost,
  decimal = false,
  unit,
}: {
  // The id of the screen's question, which names the value.
  readonly labelledBy: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly digitsAtMost: number;
  // Whether a decimal point may be typed (a measurement); never for a load call.
  readonly decimal?: boolean;
  // The unit shown after the value (the translation file's), if any.
  readonly unit?: string;
}) {
  const typed = (key: string) => {
    if (value.replace('.', '').length >= digitsAtMost) return;
    onChange(value === '0' && key !== '.' ? key : value + key);
  };
  const point = () => {
    if (value.includes('.')) return;
    onChange(value === '' ? '0.' : `${value}.`);
  };
  return (
    <div className="keypad">
      <output className="keypad-value" aria-labelledby={labelledBy}>
        {value === '' ? (
          <span className="keypad-empty">{words.look.keypad.empty}</span>
        ) : (
          <>
            <span className="big-number">{value}</span>
            {unit === undefined ? null : <span>{unit}</span>}
          </>
        )}
      </output>
      <div className="keypad-keys">
        {digits.map((digit) => (
          <Pressable
            key={digit}
            className="button keypad-key"
            onPress={() => {
              typed(digit);
            }}
          >
            {digit}
          </Pressable>
        ))}
        {decimal ? (
          <Pressable className="button keypad-key" onPress={point}>
            {decimalPoint}
            <span className="unseen">{words.look.keypad.point}</span>
          </Pressable>
        ) : (
          <Pressable
            className="button keypad-key keypad-word"
            onPress={() => {
              onChange('');
            }}
          >
            {words.look.keypad.clear}
          </Pressable>
        )}
        <Pressable
          className="button keypad-key"
          onPress={() => {
            typed('0');
          }}
        >
          {zero}
        </Pressable>
        <Pressable
          className="button keypad-key"
          aria-label={words.look.keypad.delete}
          onPress={() => {
            onChange(value.slice(0, -1));
          }}
        >
          <Erase />
        </Pressable>
      </div>
    </div>
  );
}

const zero = '0';
const decimalPoint = '.';
