// A camera that shows a barcode, for the browser tests of scanning (BACKLOG 3.6.3; AC-11-49;
// ADR-596). Chromium's own fake camera shows a pattern of its own, never a barcode, and is fixed
// when the browser starts; so before the app loads, this page's camera is swapped for a canvas
// the test draws on: grey paper on a darker table, the bars a test gives in near-black, a module
// a fraction of a pixel off whole and blurred, as a lens sees print. The app opens it through
// `getUserMedia` as it opens the phone's (`src/phone/camera.ts`) and reads it as it reads a real
// camera's frames; nothing of the app is changed for it.
import type { Page } from '@playwright/test';

interface Showing {
  __barcodeShown: (bars: readonly number[], module: number) => void;
}

export async function barcodeCamera(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const drawing = canvas.getContext('2d');
    let shown: { bars: readonly number[]; module: number } = { bars: [], module: 3.3 };
    const paint = () => {
      if (drawing === null) return;
      drawing.filter = 'none';
      drawing.fillStyle = '#7b8088';
      drawing.fillRect(0, 0, 1280, 720);
      drawing.fillStyle = '#efede6';
      drawing.fillRect(180, 180, 920, 360);
      drawing.filter = 'blur(0.8px)';
      drawing.fillStyle = '#1e1e24';
      const wide = shown.bars.reduce((sum, width) => sum + width, 0) * shown.module;
      let at = 640 - wide / 2;
      shown.bars.forEach((width, place) => {
        if (place % 2 === 0) drawing.fillRect(at, 260, width * shown.module, 200);
        at += width * shown.module;
      });
    };
    (window as unknown as Showing).__barcodeShown = (bars, module) => {
      shown = { bars, module };
      paint();
    };
    paint();
    // Drawn again and again, so the stream always has a frame to give.
    window.setInterval(paint, 50);
    navigator.mediaDevices.getUserMedia = () => Promise.resolve(canvas.captureStream(20));
  });
}

// What the camera shows from now: a barcode's bars and spaces in modules, a bar first (none for
// plain paper), each module `module` pixels wide.
export async function showing(page: Page, bars: readonly number[], module = 3.3): Promise<void> {
  await page.evaluate(
    ([given, size]) => {
      (window as unknown as Showing).__barcodeShown(given, size);
    },
    [bars, module] as const,
  );
}
