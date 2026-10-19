// The accessibility check's two halves that need no browser (BACKLOG 3.1.3; ADR-566; AC-11-51):
// which screens the app has, read from its source; the WCAG 2.2 A and AA rules it runs; and the
// reporter failing a run that leaves a screen unchecked. The check itself runs in the browser
// tests (`e2e/accessible.ts`).
import axe from 'axe-core';
import type { FullResult, TestCase, TestResult } from '@playwright/test/reporter';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ScreensReached, { attachmentName, screensIn, type ScreenCheck } from '../e2e/screens.ts';
import { rules, wcagLevels } from '../e2e/wcag.ts';

const tsx = (path: string, text: string) => ({ path, text });

describe('AC-11-51: the screens of the field app', () => {
  it('AC-11-51: are read from its source and its prototype’s, each named once by a literal', () => {
    expect(screensIn()).toEqual([
      'create-monitor',
      'enrol',
      'home',
      'monitor-created',
      'move-passcode',
      'move-site',
      'move-made',
      'session-passcode',
      'session-monitor',
      'phone-locked',
      'phone',
      'setup-passcode',
      'setup-project',
      'setup-work',
      'setup-site',
      'setup-pay-items',
      'setup-monitor',
      'setup-hand-over',
      'setup-handed',
      'setup-made',
      'no-assignment',
      'sync',
      'settings',
      'turned-in',
      'turn-in',
      'prototype-collection',
      'prototype-stop',
      'prototype-sync',
      'prototype-tower',
      'prototype-unit-rate',
    ]);
    expect(
      screensIn([
        tsx('a.tsx', 'export const A = () => <main data-screen="home"><p data-x="1" /></main>;'),
        tsx('b.tsx', 'export const B = () => <><main data-screen="tower" /><p /></>;'),
      ]),
    ).toEqual(['home', 'tower']);
  });

  it('AC-11-51: a screen named by an expression, or named twice, is refused', () => {
    expect(() =>
      screensIn([tsx('a.tsx', 'export const A = (n: string) => <main data-screen={n} />;')]),
    ).toThrow('a.tsx: a screen names itself by a literal (data-screen={n}).');
    expect(() =>
      screensIn([
        tsx('a.tsx', 'export const A = () => <main data-screen="home" />;'),
        tsx('b.tsx', 'export const B = () => <div data-screen="home" />;'),
      ]),
    ).toThrow('b.tsx: the screen "home" is named twice.');
  });
});

describe('AC-11-51: the rules the check runs', () => {
  it('AC-11-51: are every WCAG 2.0, 2.1 and 2.2 A and AA rule axe-core has, its experimental ones too, and no rule of 4.1.1 or AAA alone', () => {
    // axe-core 4.14.0 tags 70 rules at these levels, four of them experimental.
    expect(rules).toHaveLength(70);
    expect(rules).toEqual(
      expect.arrayContaining([
        'target-size', // 2.5.8, new in 2.2
        'css-orientation-lock', // experimental, as the three below
        'p-as-heading',
        'table-fake-caption',
        'td-has-header',
      ]),
    );
    // 4.1.1's, gone from 2.2, and AAA's alone are not run.
    for (const rule of ['duplicate-id', 'duplicate-id-active', 'color-contrast-enhanced']) {
      expect(rules).not.toContain(rule);
    }
    expect(wcagLevels).not.toContain('wcag2a-obsolete');
    expect(axe.version).toBe('4.14.0');
  });
});

describe('AC-11-51: the run', () => {
  const lines: string[] = [];
  vi.spyOn(console, 'log').mockImplementation((line: string) => lines.push(line));
  afterEach(() => {
    lines.length = 0;
    vi.unstubAllEnvs();
  });

  const ran = (screens: readonly string[], violations: ScreenCheck['violations'] = []) => {
    const reporter = new ScreensReached();
    for (const screen of screens) {
      const checked: ScreenCheck = { screen, rules: rules.length, violations, incomplete: [] };
      reporter.onTestEnd(
        {} as TestCase,
        {
          attachments: [
            {
              name: attachmentName,
              contentType: 'application/json',
              body: Buffer.from(JSON.stringify(checked)),
            },
          ],
        } as unknown as TestResult,
      );
    }
    return reporter.onEnd({ status: 'passed' } as FullResult);
  };

  it('AC-11-51: passes when every screen was checked, and says how many', async () => {
    expect(await ran([...screensIn(), 'enrol'])).toBeUndefined();
    expect(lines.join('\n')).toBe(
      '\nAccessibility: 30 of 30 screens checked, in 31 checks; 0 found.',
    );
  });

  it('AC-11-51: fails when a screen was reached by no browser test, a check names a screen the app lacks, or a check found anything', async () => {
    expect(await ran([])).toEqual({ status: 'failed' });
    expect(lines).toContain('✗ the enrol screen was reached by no browser test');
    expect(await ran(['enrol', 'tower'])).toEqual({ status: 'failed' });
    expect(lines).toContain("✗ a check names the tower screen, which the app doesn't have");
    expect(await ran(['enrol'], [{ rule: 'button-name', help: '', where: ['button'] }])).toEqual({
      status: 'failed',
    });
    expect(lines).toContain(
      '✗ 1 found on the screens checked (each test\'s "accessibility" attachment)',
    );
  });

  it('AC-11-51: a run of some tests alone, said so, lists a screen it did not reach without failing', async () => {
    vi.stubEnv('ADMS_E2E_SOME', '1');
    expect(await ran([])).toBeUndefined();
    expect(lines).toContain('· the enrol screen was reached by no browser test');
    expect(await ran(['enrol', 'tower'])).toEqual({ status: 'failed' });
  });
});
