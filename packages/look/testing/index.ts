// The browser tests' accessibility checks, for every web app (BACKLOG 3.1.3; ADR-566; item
// 3.10.2): WCAG 2.2 A and AA by axe-core, in both themes, at 320 CSS px and 200% text, on its side,
// and the keyboard's walk round each screen; and the reporter that fails a run where a screen of
// the app's was reached by no test.
export { accessibilityChecks, type Checking, type ChecksOf } from './accessible.ts';
export { walkFocus, type FocusStop, type Walk } from './focus-walk.ts';
export {
  attachmentName,
  modulesIn,
  screenAttribute,
  screensIn,
  ScreensReached,
  type ScreenCheck,
  type ScreensOptions,
} from './screens.ts';
export { rules, wcagLevels } from './wcag.ts';
