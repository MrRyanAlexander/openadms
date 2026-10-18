// The progress header (ADR-561 (5)): one question a screen, how far through the record it is,
// and Back, which works until the record is submitted and is then gone (ADR-477). The bar is
// drawn for the eye; the words say the same to a screen reader.
import { say, words } from '../words.ts';
import { Button } from './button.tsx';
import { Backward } from './icons.tsx';

export function ProgressHeader({
  titleId,
  title,
  step,
  steps,
  onBack,
}: {
  readonly titleId: string;
  readonly title: string;
  readonly step: number;
  readonly steps: number;
  // None once the record is submitted.
  readonly onBack?: () => void;
}) {
  return (
    <header className="progress-header">
      <div className="progress-header-row">
        {onBack === undefined ? (
          <span />
        ) : (
          <Button icon={<Backward />} onPress={onBack}>
            {words.look.back}
          </Button>
        )}
        <span className="quiet">{say(words.look.step, { step, steps })}</span>
      </div>
      <div className="progress-bar" aria-hidden="true">
        <div className="progress-bar-done" style={{ width: `${String((step / steps) * 100)}%` }} />
      </div>
      <h1 id={titleId}>{title}</h1>
    </header>
  );
}
