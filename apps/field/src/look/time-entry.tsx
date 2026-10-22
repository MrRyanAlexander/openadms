// A time of day typed (task 3.7.2, ADR-601): its label, the phone's own time field, and a line of
// help beneath it, each tied to the field for a screen reader. The field shows the time as the
// phone's language writes it (8:20 AM in English) and hands on what was typed on the 24-hour
// clock, "08:20", or nothing while it isn't a whole time; the phone's own picker opens on a
// press. No dependency: the browser's and the phones' own control (WCAG 4.1.2 by the platform).
import { useId } from 'react';

export function TimeEntry({
  label,
  value,
  onChange,
  hint,
}: {
  readonly label: string;
  // "08:20", or empty.
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly hint?: string;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="field-input"
        type="time"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        {...(hint === undefined ? {} : { 'aria-describedby': hintId })}
      />
      {hint === undefined ? null : (
        <span id={hintId} className="field-hint">
          {hint}
        </span>
      )}
    </div>
  );
}
