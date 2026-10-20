// The phone's camera, in the browser build (ARCHITECTURE §11; REQ-316; BACKLOG 3.6.1, C176;
// AC-04-79, AC-11-68; ADR-101, 586): a photograph comes from the camera only, never the phone's
// gallery or a file, and goes only into the app's own store, never the phone's shared library.
//
// - **Asked when first needed**: the camera is opened only when the monitor presses to take a
//   photograph, and let go as soon as it is taken or put away. The page's own Permissions-Policy
//   lets the app's own page ask (`camera=(self)`, C176), and nobody else.
// - **Refused, the work goes on** (ADR-052; AC-11-68): a camera refused or not there is said, and
//   nothing waits on it.
// - **What the camera sees is never put on the page as a video**: the live view is drawn frame by
//   frame on a canvas, as the photographs are, so the page's policy takes no `blob:` or media
//   source (AC-11-61). The photograph is the frame at its full size, encoded once by the browser:
//   the original, fingerprinted as it is (`photographs.ts`). The iPhone and Android builds take
//   it through the platform's own camera (tasks 3.8.2, 3.9.1).

// What opening the camera came to: a live view, the camera refused, or none to open.
export type CameraOpened =
  | { readonly kind: 'open'; readonly view: CameraView }
  | { readonly kind: 'refused' }
  | { readonly kind: 'none' };

// The camera, open: what it sees, drawn; the photograph taken; let go.
export interface CameraView {
  drawOn(canvas: HTMLCanvasElement, most: number): void;
  taken(): Promise<Uint8Array | undefined>;
  closed(): void;
}

export interface Camera {
  opened(): Promise<CameraOpened>;
}

// The camera facing away from the monitor, at the most it gives: the frame is what is kept.
const asked: MediaStreamConstraints = {
  audio: false,
  video: {
    facingMode: { ideal: 'environment' },
    width: { ideal: 4096 },
    height: { ideal: 4096 },
  },
};

export class BrowserCamera implements Camera {
  async opened(): Promise<CameraOpened> {
    if (!('mediaDevices' in navigator)) return { kind: 'none' };
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(asked);
    } catch (failed) {
      const refused =
        failed instanceof DOMException &&
        (failed.name === 'NotAllowedError' || failed.name === 'SecurityError');
      return { kind: refused ? 'refused' : 'none' };
    }
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    try {
      await video.play();
    } catch {
      for (const track of stream.getTracks()) track.stop();
      return { kind: 'none' };
    }
    return { kind: 'open', view: new BrowserCameraView(stream, video) };
  }
}

class BrowserCameraView implements CameraView {
  private readonly stream: MediaStream;
  private readonly video: HTMLVideoElement;

  constructor(stream: MediaStream, video: HTMLVideoElement) {
    this.stream = stream;
    this.video = video;
  }

  // What the camera sees now, at most `most` pixels on its longer side.
  drawOn(canvas: HTMLCanvasElement, most: number): void {
    const { videoWidth: width, videoHeight: height } = this.video;
    if (width === 0 || height === 0) return;
    const scale = Math.min(1, most / Math.max(width, height));
    const drawnWidth = Math.max(1, Math.round(width * scale));
    const drawnHeight = Math.max(1, Math.round(height * scale));
    if (canvas.width !== drawnWidth) canvas.width = drawnWidth;
    if (canvas.height !== drawnHeight) canvas.height = drawnHeight;
    canvas.getContext('2d')?.drawImage(this.video, 0, 0, drawnWidth, drawnHeight);
  }

  // The frame showing now at its full size, as the browser encodes a photograph.
  async taken(): Promise<Uint8Array | undefined> {
    const { videoWidth: width, videoHeight: height } = this.video;
    if (width === 0 || height === 0) return undefined;
    const frame = document.createElement('canvas');
    frame.width = width;
    frame.height = height;
    frame.getContext('2d')?.drawImage(this.video, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => {
      frame.toBlob(resolve, 'image/jpeg');
    });
    return blob === null ? undefined : new Uint8Array(await blob.arrayBuffer());
  }

  closed(): void {
    for (const track of this.stream.getTracks()) track.stop();
    this.video.srcObject = null;
  }
}
