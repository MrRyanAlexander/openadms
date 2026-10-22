// A screen's title (item 3.10.2; WCAG 2.4.3, 1.3.2, 4.1.2): the screen's one heading, which takes
// the focus as the screen appears and again when its question changes (the next step of a record).
// So a screen reader says where the monitor now is, and Tab goes on from the top of the new screen,
// never from wherever the control just pressed used to be (the browser's own place for it, lost
// with that control). The title is no control: Tab never stops on it, and it draws no ring.
import { useEffect, useRef } from 'react';

export function ScreenTitle({ id, children }: { readonly id?: string; readonly children: string }) {
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    title.current?.focus();
  }, [children]);
  return (
    <h1 ref={title} id={id} tabIndex={-1} className="screen-title">
      {children}
    </h1>
  );
}
