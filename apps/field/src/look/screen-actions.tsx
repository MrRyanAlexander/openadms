// A screen's actions (ADR-561 (5); item 3.10.2; WCAG 1.4.10, 1.4.4, 2.4.11): the main action and
// those beside it, held at the foot of the screen in thumb reach while the work scrolls under them,
// **so long as they take at most `heldAtMost` of the screen's height**. Past that (the phone on its
// side, its largest text) they would cover the work itself, so they take their place after it
// instead and the screen scrolls as one. While they are held, **a control the focus comes to is
// never left behind them** (WCAG 2.4.11): it is scrolled to stand clear above them. (A scroll
// padding of their height isn't enough: Chrome leaves a control where it is when the viewport shows
// it, behind the actions or not.)
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

// The most of the screen's height the actions are held over: beyond it, too little of the work is
// left in sight. Every screen's actions take less upright at the phone's own text size.
const heldAtMost = 0.4;

export function ScreenActions({ children }: { readonly children: ReactNode }) {
  const actions = useRef<HTMLDivElement>(null);
  const [held, setHeld] = useState(true);
  useLayoutEffect(() => {
    const element = actions.current;
    if (element === null) return;
    const measured = () => {
      setHeld(element.offsetHeight <= innerHeight * heldAtMost);
    };
    // A control focused behind the actions held, scrolled to stand a line's height above them;
    // only as the browser shows its focus (the keyboard, a field), never under a tap on a button,
    // which a scroll beneath it would undo.
    const focused = (event: FocusEvent) => {
      const control = event.target;
      if (!(control instanceof Element) || element.contains(control)) return;
      if (!control.matches(':focus-visible')) return;
      if (getComputedStyle(element).position !== 'sticky') return;
      const behind = control.getBoundingClientRect().bottom - element.getBoundingClientRect().top;
      const room = parseFloat(getComputedStyle(document.documentElement).fontSize);
      if (behind > -room) scrollBy({ top: behind + room });
    };
    const sized = new ResizeObserver(measured);
    sized.observe(element);
    addEventListener('resize', measured);
    document.addEventListener('focusin', focused);
    measured();
    return () => {
      sized.disconnect();
      removeEventListener('resize', measured);
      document.removeEventListener('focusin', focused);
    };
  }, []);
  return (
    <div ref={actions} className={held ? 'screen-actions' : 'screen-actions screen-actions-after'}>
      {children}
    </div>
  );
}
