// What every capture in the prototype shares (ADR-561 (5)): the status strip, the progress header
// and its one question, the work, and the main action at the bottom; the confirmation Q-215 asks
// about; and the ticket number, shown or scanned, then typed again where Q-218's choice says.
import { useId, useState, type ReactNode } from 'react';

import {
  Banner,
  Button,
  ListPicker,
  NumberKeypad,
  ProgressHeader,
  ScanField,
  StatusStrip,
  type Standing,
} from '../src/look/index.ts';
import { say } from '../src/words.ts';
import { words, world } from './world.ts';

export function Capture({
  standing,
  titleId,
  title,
  step,
  steps,
  onBack,
  actions,
  children,
}: {
  readonly standing: Standing;
  readonly titleId: string;
  readonly title: string;
  readonly step: number;
  readonly steps: number;
  readonly onBack?: (() => void) | undefined;
  readonly actions: ReactNode;
  readonly children?: ReactNode;
}) {
  return (
    <>
      <StatusStrip standing={standing} />
      <div className="screen-body">
        {onBack === undefined ? (
          <ProgressHeader titleId={titleId} title={title} step={step} steps={steps} />
        ) : (
          <ProgressHeader
            titleId={titleId}
            title={title}
            step={step}
            steps={steps}
            onBack={onBack}
          />
        )}
        {children}
      </div>
      <div className="screen-actions">{actions}</div>
    </>
  );
}

// The steps a capture goes through, and where it is: Back moves one step back until submit.
export function useSteps<Step extends string>(order: readonly Step[]) {
  const [step, setStep] = useState<Step>(() => {
    const first = order[0];
    if (first === undefined) throw new Error('A capture has at least one step.');
    return first;
  });
  const place = order.indexOf(step);
  const before = order[place - 1];
  return {
    step,
    go: setStep,
    number: place + 1,
    steps: order.length,
    back:
      before === undefined
        ? undefined
        : () => {
            setStep(before);
          },
    onward: () => {
      const next = order[place + 1];
      if (next !== undefined) setStep(next);
    },
  };
}

// Q-215's confirmation, when the switch asks for one: the picked value said back, then on.
export interface Asking {
  readonly value: string;
  readonly onward: () => void;
}

export function Confirmation({
  standing,
  asking,
  onChange,
}: {
  readonly standing: Standing;
  readonly asking: Asking;
  readonly onChange: () => void;
}) {
  const titleId = useId();
  return (
    <>
      <StatusStrip standing={standing} />
      <div className="screen-body">
        <h1 id={titleId}>{words.flow.confirm.title}</h1>
        <p className="big-number">{say(words.flow.confirm.picked, { value: asking.value })}</p>
      </div>
      <div className="screen-actions">
        <Button main onPress={asking.onward}>
          {words.flow.confirm.yes}
        </Button>
        <Button wide onPress={onChange}>
          {words.flow.confirm.change}
        </Button>
      </div>
    </>
  );
}

// The number the phone made, shown big, to be noted as the firm asks.
export function NumberShown({ number }: { readonly number: string }) {
  return (
    <>
      <p className="big-number">{number}</p>
      <p>{words.number.shownAbout}</p>
    </>
  );
}

// The number typed again by hand: it must match before the record is submitted (ADR-209; data
// entry, never an eligibility block).
export function TypeAgain({
  titleId,
  number,
  value,
  onChange,
  wrong,
  shown,
  onShow,
}: {
  readonly titleId: string;
  readonly number: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly wrong: boolean;
  readonly shown: boolean;
  readonly onShow: () => void;
}) {
  return (
    <>
      {wrong ? (
        <Banner tone="problem" announced>
          <p>{words.number.wrong}</p>
        </Banner>
      ) : null}
      {shown ? <p className="big-number">{number}</p> : null}
      <NumberKeypad
        labelledBy={titleId}
        value={value}
        onChange={onChange}
        digitsAtMost={number.length}
      />
      {shown ? null : (
        <Button wide onPress={onShow}>
          {words.number.showAgain}
        </Button>
      )}
    </>
  );
}

// The driver's ticket scanned at the tower, or typed when the barcode won't read.
export function TicketScan({
  value,
  onChange,
  onScan,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onScan: () => void;
}) {
  return (
    <ScanField label={words.number.scanLabel} value={value} onChange={onChange} onScan={onScan} />
  );
}

// Why a number was typed, from the firm's list (ADR-111, 173), and the calm word that it is flagged.
export function TypedReason({
  titleId,
  picked,
  onPick,
}: {
  readonly titleId: string;
  readonly picked: string | null;
  readonly onPick: (reason: string) => void;
}) {
  return (
    <>
      <Banner tone="notice">
        <p>{words.number.typed}</p>
      </Banner>
      <ListPicker
        labelledBy={titleId}
        choices={world.typedReasons.map((reason) => ({ key: reason, label: reason }))}
        picked={picked}
        onPick={onPick}
      />
    </>
  );
}

// The record submitted: sealed for its monitor, printed, and the next ticket in one tap.
export function Submitted({
  number,
  printed,
  onPrint,
}: {
  readonly number: string;
  readonly printed: boolean;
  readonly onPrint: () => void;
}) {
  return (
    <>
      <Banner tone="good" announced>
        <p>{say(words.flow.saved, { number })}</p>
      </Banner>
      <p className="quiet">{words.flow.sealed}</p>
      {printed ? (
        <Banner tone="info" announced>
          <p>{words.flow.printed}</p>
        </Banner>
      ) : (
        <Button wide onPress={onPrint}>
          {words.flow.print}
        </Button>
      )}
    </>
  );
}
