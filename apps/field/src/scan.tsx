// Scanning, in the browser build (ARCHITECTURE §12; REQ-315; BACKLOG 3.6.3; AC-11-49; Q-95, Q-105;
// ADR-586, 595, 596).
//
// - **Wherever a number is scanned** (a badge, a control ticket, the driver's ticket, an
//   incident's cert number, and home's "Scan a barcode"), the one scan field takes it **by a
//   keyboard-style scanner** (`look/scan-field.tsx`) **or by the camera**: "Scan" opens the camera
//   over the screen, a modal dialog showing what it sees, and the number is taken as soon as two
//   lines across the barcode read it (`phone/scanning.ts`), as a scanner's Enter takes it; the
//   camera is let go at once. "Put the camera away" (or Escape) takes nothing. The camera refused
//   or not there is said beside the field, and the scanner or typing goes on (ADR-052).
// - **"Scan a barcode"** on home: anything Open ADMS printed scans back, and the phone says what it
//   holds under the number, never fetching it (the user, Q-95): each of the monitor's field events
//   of the ticket on the project and whether it is open, submitted or cancelled; a certification
//   they made here, or one in the phone's lists; or that nothing here has it. Nothing is saved,
//   sent or counted.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';

import { Viewfinder } from './camera.tsx';
import {
  Banner,
  Button,
  ScanField,
  ScreenActions,
  ScreenTitle,
  StatusStrip,
  type Standing,
} from './look/index.ts';
import type { Camera, CameraView } from './phone/camera.ts';
import { barcodeIn, type ScannedBack } from './phone/scanning.ts';
import { say, words } from './words.ts';

const said = words.scanning;

// What is read of the camera's view: its longer side, and how often.
const scanMost = 1280;
const readEveryMs = 100;

// The scan field with the camera's scanner behind its Scan button.
export function ScanEntry({
  camera,
  label,
  value,
  onChange,
  onEnter,
  keyboard = true,
}: {
  readonly camera: Camera;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  // Enter on the field, or a barcode read by the camera, with the number.
  readonly onEnter?: (value: string) => void;
  readonly keyboard?: boolean;
}) {
  const [view, setView] = useState<CameraView | undefined>();
  const [opening, setOpening] = useState(false);
  const [told, setTold] = useState<'refused' | 'none' | null>(null);
  // The camera open now, let go if the screen goes first; and what to tell of a read.
  const open = useRef<CameraView | undefined>(undefined);
  const tell = useRef({ onChange, onEnter });
  tell.current = { onChange, onEnter };
  useEffect(
    () => () => {
      open.current?.closed();
      open.current = undefined;
    },
    [],
  );
  const away = () => {
    open.current?.closed();
    open.current = undefined;
    setView(undefined);
  };
  // While the camera is open, what it sees is read until a barcode reads.
  useEffect(() => {
    if (view === undefined) return;
    const reading = window.setInterval(() => {
      const frame = view.seen(scanMost);
      const read = frame === undefined ? undefined : barcodeIn(frame);
      if (read === undefined) return;
      window.clearInterval(reading);
      open.current?.closed();
      open.current = undefined;
      setView(undefined);
      tell.current.onChange(read);
      tell.current.onEnter?.(read);
    }, readEveryMs);
    return () => {
      window.clearInterval(reading);
    };
  }, [view]);
  return (
    <>
      {told === null ? null : (
        <Banner tone="notice" announced>
          <p>{told === 'refused' ? said.camera.refused : said.camera.none}</p>
        </Banner>
      )}
      <ScanField
        label={label}
        value={value}
        onChange={onChange}
        keyboard={keyboard}
        {...(onEnter === undefined ? {} : { onEnter })}
        onScan={() => {
          if (opening || view !== undefined) return;
          setOpening(true);
          void camera.opened().then((opened) => {
            setOpening(false);
            if (opened.kind !== 'open') {
              setTold(opened.kind);
              return;
            }
            setTold(null);
            open.current = opened.view;
            setView(opened.view);
          });
        }}
      />
      {opening ? <p role="status">{said.camera.opening}</p> : null}
      <ModalOverlay
        isOpen={view !== undefined}
        onOpenChange={(isOpen) => {
          if (!isOpen) away();
        }}
        className="camera-overlay"
      >
        <Modal className="camera">
          <Dialog className="camera-dialog">
            <Heading slot="title">{said.camera.title}</Heading>
            {view === undefined ? null : <Viewfinder view={view} />}
            <p>{said.camera.hold}</p>
            <div className="camera-actions">
              <Button main wide onPress={away}>
                {said.camera.away}
              </Button>
            </div>
          </Dialog>
        </Modal>
      </ModalOverlay>
    </>
  );
}

// One thing the phone holds under a number scanned back, in words.
function foundSaid(number: string, found: ScannedBack): string {
  switch (found.kind) {
    case 'ticket': {
      const { ticket } = found;
      return say(said.found.ticket, {
        number: ticket.splitSuffix === '' ? number : `${number}-${ticket.splitSuffix}`,
        kind: words.capture.kinds[ticket.kind].toLowerCase(),
        state: said.state[ticket.state],
      });
    }
    case 'certification':
      return say(said.found.certification, {
        number,
        state: said.state[found.certification.state],
      });
    case 'inLists':
      return say(said.found.inLists, { number });
  }
}

// Home's "Scan a barcode": a number scanned back, and what the phone holds under it.
export function ScanBack({
  camera,
  standing,
  find,
  onBack,
  below,
}: {
  readonly camera: Camera;
  readonly standing: Standing;
  readonly find: (number: string) => readonly ScannedBack[];
  readonly onBack: () => void;
  readonly below?: ReactNode;
}) {
  const [value, setValue] = useState('');
  const [shown, setShown] = useState<{
    readonly number: string;
    readonly found: readonly ScannedBack[];
  } | null>(null);
  const look = (number: string) => {
    const bare = number.trim();
    if (bare === '') return;
    setShown({ number: bare, found: find(bare) });
    setValue('');
  };
  return (
    <main data-screen="scan-back" className="screen">
      <StatusStrip standing={standing} />
      <div className="screen-body">
        <ScreenTitle>{said.title}</ScreenTitle>
        <p className="quiet">{said.about}</p>
        <ScanEntry
          camera={camera}
          label={said.label}
          value={value}
          onChange={setValue}
          onEnter={look}
        />
        <Button
          wide
          isDisabled={value.trim() === ''}
          onPress={() => {
            look(value);
          }}
        >
          {said.look}
        </Button>
        <div role="status">
          {shown === null ? null : shown.found.length === 0 ? (
            <p>{say(said.nothing, { number: shown.number })}</p>
          ) : (
            shown.found.map((found, place) => (
              <p key={`${found.kind}-${String(place)}`}>{foundSaid(shown.number, found)}</p>
            ))
          )}
        </div>
      </div>
      <ScreenActions>
        <Button main wide onPress={onBack}>
          {said.back}
        </Button>
      </ScreenActions>
      {below}
    </main>
  );
}
