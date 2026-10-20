// Taking a photograph (ARCHITECTURE §11; REQ-316; BACKLOG 3.6.1; AC-04-79, AC-11-68, 78; ADR-101,
// 157, 571, 586): the one way every capture screen takes one, from the camera only. A press opens
// the camera over the screen it was pressed on, showing what it sees; "Take the photo" keeps that
// frame and puts the camera away; "Put the camera away" (or Escape) takes nothing. Nothing else
// on the page can be reached while the camera is open (React Aria's modal dialog). The camera
// refused or not there is said beside the button, and the work goes on (AC-11-68).
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';

import { Banner, Button, type ButtonTone } from './look/index.ts';
import { Camera as CameraIcon } from './look/icons.tsx';
import type { Camera, CameraView } from './phone/camera.ts';
import { words } from './words.ts';

const said = words.capture.camera;

// The live view's longest side, drawn: the photograph itself is the frame at its full size.
const viewMost = 1200;

// What the camera sees, drawn on a canvas each frame while it is open; a scan's too (scan.tsx).
export function Viewfinder({ view }: { readonly view: CameraView }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let frame = 0;
    const draw = () => {
      if (canvas.current !== null) view.drawOn(canvas.current, viewMost);
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [view]);
  return <canvas ref={canvas} role="img" aria-label={said.view} className="camera-view" />;
}

// The button that takes a photograph, the camera it opens, and what is said where it couldn't be
// opened or its photograph couldn't be kept.
export function TakePhoto({
  camera,
  isDisabled = false,
  tone,
  icon,
  onTaken,
  children,
}: {
  readonly camera: Camera;
  readonly isDisabled?: boolean;
  // A stage of the work's state, and its icon in the camera's place (ADR-590).
  readonly tone?: ButtonTone | undefined;
  readonly icon?: ReactNode;
  // Whether the photograph was kept: one too large to ever go is not.
  readonly onTaken: (bytes: Uint8Array) => Promise<boolean>;
  readonly children: ReactNode;
}) {
  const [view, setView] = useState<CameraView | undefined>();
  const [busy, setBusy] = useState<'no' | 'opening' | 'taking'>('no');
  const [told, setTold] = useState<'refused' | 'none' | 'notKept' | null>(null);
  // The camera open now, let go if the screen goes first.
  const open = useRef<CameraView | undefined>(undefined);
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
    setBusy('no');
  };
  return (
    <>
      {told === 'refused' || told === 'none' ? (
        <Banner tone="notice" announced>
          <p>{told === 'refused' ? said.refused : said.none}</p>
        </Banner>
      ) : null}
      {told === 'notKept' ? (
        <Banner tone="notice" announced>
          <p>{words.capture.photos.tooLarge}</p>
        </Banner>
      ) : null}
      <Button
        wide
        tone={tone}
        icon={icon ?? <CameraIcon />}
        isDisabled={isDisabled || busy !== 'no'}
        onPress={() => {
          setBusy('opening');
          void camera.opened().then((opened) => {
            if (opened.kind !== 'open') {
              setTold(opened.kind);
              setBusy('no');
              return;
            }
            setTold(null);
            open.current = opened.view;
            setView(opened.view);
            setBusy('no');
          });
        }}
      >
        {busy === 'opening' ? said.opening : children}
      </Button>
      <ModalOverlay
        isOpen={view !== undefined}
        onOpenChange={(isOpen) => {
          if (!isOpen) away();
        }}
        className="camera-overlay"
      >
        <Modal className="camera">
          <Dialog className="camera-dialog">
            <Heading slot="title">{said.title}</Heading>
            {view === undefined ? null : <Viewfinder view={view} />}
            <div className="camera-actions">
              <Button
                main
                wide
                isDisabled={busy !== 'no'}
                onPress={() => {
                  if (view === undefined) return;
                  setBusy('taking');
                  void view.taken().then(async (bytes) => {
                    away();
                    const kept = bytes === undefined ? false : await onTaken(bytes);
                    setTold(kept ? null : 'notKept');
                  });
                }}
              >
                {busy === 'taking' ? said.taking : said.take}
              </Button>
              <Button wide isDisabled={busy !== 'no'} onPress={away}>
                {said.away}
              </Button>
            </div>
          </Dialog>
        </Modal>
      </ModalOverlay>
    </>
  );
}
