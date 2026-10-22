// One of the golden mission's phones, driven through the field app's screens as its monitor
// drives it (spec/golden/MISSION.md §1…§3; PLAN item 3.10.1; ADR-603): enrolled once through its
// first screen, signed in at the yard each morning, online, where it takes the day's assignment
// and its lists, then out all day with no signal, every capture begun at New (the badge, then the
// number) and completed later from home's open list, and synced back at the yard in the evening.
//
// **The phone's clock is the mission's** (ADR-100): set before each thing the monitor does, to the
// moment the mission gives it, and the world's set to the same before the phone reaches it.
// **The phone's own lock after inactivity is honoured** (ADR-575; the build's policy values):
// where the mission leaves a phone untouched longer than the lock, its monitor is signed out, and
// signs in again from its login list (or online, at the yard); where it is left past the
// warning, the monitor keeps signed in. Nothing waits on a time passing: each step waits on what
// the screen shows.
//
// Each screen the mission reaches is checked against WCAG 2.2 A and AA the first time the run
// meets it (`accessible.ts`).
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

import type { Browser, BrowserContext, Page } from '@playwright/test';
import { Policy } from '@open-adms/domain';

import english from '../src/words/en.json' with { type: 'json' };
import { checkScreen, expect } from './accessible.ts';
import {
  enrolled,
  filled,
  openedUnder,
  photographed,
  recorded,
  toApi,
  type Asked,
} from './phone-page.ts';
import { screenAttribute } from './screens.ts';
import type { MissionMonitor, MissionWorld } from './mission-world.ts';

const said = english.capture;
const forms = english.forms;

// The build's lock after inactivity (vite.config.ts reads the same file): the policy's values.
const policy = Policy.from(
  parseEnv(readFileSync(new URL('../../../packages/domain/policy.env', import.meta.url), 'utf8')),
);
const lockMs = policy.phoneInactivityLockMinutes * 60_000;
const warnMs = lockMs - policy.phoneInactivityWarningSeconds * 1000;

// A place in the example world (spec/CONVENTIONS.md §6), as the browser gives the phone its fix.
export interface Place {
  readonly latitude: number;
  readonly longitude: number;
}

// The screens checked so far in this run: each once.
const checked = new Set<string>();

// Digits, and a decimal point, typed on the keypad.
async function keyed(page: Page, typed: string): Promise<void> {
  for (const key of typed) {
    await (
      key === '.'
        ? page.getByRole('button', { name: english.look.keypad.point })
        : page.getByRole('button', { name: key, exact: true })
    ).click();
  }
}

const quoted = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// What a capture starts from on home.
type Start = keyof typeof english.home.start;

export class MissionPhone {
  readonly name: string;
  readonly page: Page;
  private readonly context: BrowserContext;
  private readonly asked: Asked[];
  private monitor: MissionMonitor | null = null;
  private signedIn = false;
  private online = true;
  // When the monitor last touched it, by its clock.
  private touched = 0;

  private constructor(name: string, context: BrowserContext, page: Page) {
    this.name = name;
    this.context = context;
    this.page = page;
    this.asked = recorded(page);
  }

  // A phone of the mission enrolled through its first screen, online, under the master passcode,
  // at that moment; its place allowed for the mission's page.
  static async enrolled(
    browser: Browser,
    world: MissionWorld,
    name: string,
    at: string,
  ): Promise<MissionPhone> {
    // A phone's screen, touch and browser, from the run's config as every browser test's
    // (playwright.mission.config.ts), set to the time zone where the mission works: a phone in
    // Bayline County is on the project's (ADR-100), never this machine's.
    const context = await browser.newContext({ timezoneId: 'America/New_York' });
    await context.grantPermissions(['geolocation'], { origin: world.origin });
    const phone = new MissionPhone(name, context, await context.newPage());
    await phone.page.clock.setFixedTime(Date.parse(at));
    phone.touched = Date.parse(at);
    await enrolled(phone.page, name, { origin: world.origin, passcode: world.passcode });
    return phone;
  }

  async close(): Promise<void> {
    await this.context.close();
  }

  // The phone's clock at the moment given. A monitor left alone past the lock is signed out by
  // the phone, and signs in again; one left past the warning keeps signed in.
  async at(time: string): Promise<void> {
    const to = Date.parse(time);
    if (to < this.touched) throw new Error(`${this.name}'s clock can't go back to ${time}.`);
    await this.page.clock.setFixedTime(to);
    const quiet = to - this.touched;
    this.touched = to;
    if (!this.signedIn) return;
    if (quiet >= lockMs) {
      await expect(this.page.getByLabel(english.phone.monitorNumber)).toBeVisible();
      this.signedIn = false;
    } else if (quiet >= warnMs) {
      await this.page.getByRole('button', { name: english.work.inactivity.stay }).click();
    }
  }

  // Where the phone is, by the fix the browser gives it.
  async placed(where: Place): Promise<void> {
    await this.context.setGeolocation(where);
  }

  // No signal from here.
  async offline(): Promise<void> {
    await this.context.setOffline(true);
    await expect.poll(() => this.page.evaluate(() => navigator.onLine)).toBe(false);
    this.online = false;
  }

  // At the yard in the morning, online: the monitor signs in and the phone takes the day's
  // assignment, its lists and its login list, and, where it makes numbers and holds none yet,
  // the first block of each series it makes. Then no signal for the day.
  async outForTheDay(monitor: MissionMonitor, project: string, firstBlocks = 0): Promise<void> {
    await this.signedInOnline(monitor, firstBlocks);
    await expect(this.page.getByText(project)).toBeVisible();
    await this.offline();
  }

  // Back at the yard in the evening, with signal: signed out, the phone finds signal and sends
  // nothing; the monitor signs in, online, and the phone syncs what it holds as it signs them in,
  // its photographs' files after; everything it made is then on the server.
  async syncedAtTheYard(monitor: MissionMonitor): Promise<void> {
    if (this.signedIn) {
      await this.page.getByRole('button', { name: english.menu.settings }).click();
      await this.page.getByRole('button', { name: english.settings.signOut }).click();
      await expect(this.page.getByLabel(english.phone.monitorNumber)).toBeVisible();
      this.signedIn = false;
    }
    await this.context.setOffline(false);
    await expect.poll(() => this.page.evaluate(() => navigator.onLine)).toBe(true);
    this.online = true;
    await this.signedInOnline(monitor, 0);
    await this.page.getByRole('button', { name: english.menu.sync }).click();
    await expect(this.page.getByText(english.sync.nothingWaits)).toBeVisible();
    await expect(this.page.getByText(/photographs?’s? files? still to send/)).toHaveCount(0);
    await expect(this.page.getByRole('heading', { name: english.sync.notSaved.title })).toHaveCount(
      0,
    );
    await this.look();
    await this.page.getByRole('button', { name: english.menu.work }).click();
  }

  // ---------------------------------------------------------------------------------------------
  // Loads and haul-outs: New, the badge, then the number; left while the truck loads.

  // A ticket whose first field event makes its number, opened at New and left: the number it
  // opened under.
  async opened(
    at: string,
    start: Extract<Start, 'collection' | 'haulOutCollection'>,
    badge: string,
    split: 'normal' | 'split' = 'normal',
  ): Promise<string> {
    await this.ready(at);
    await this.page.getByRole('button', { name: english.home.start[start] }).click();
    await expect(this.heading()).toHaveText(said.split.title);
    await this.look();
    await this.page.getByRole('button', { name: said.split[split] }).click();
    await this.page.getByLabel(said.badge.label).fill(badge);
    await this.look();
    await this.page.getByRole('button', { name: said.badge.start }).click();
    const number = await openedUnder(this.page);
    await this.look();
    await this.page.getByRole('button', { name: said.leave }).click();
    await expect(this.heading()).toHaveText(english.home.title);
    return number;
  }

  // A haul-out begun by mistake and cancelled from its open ticket: kept on the phone and never
  // sent, its number never made again. The number it held.
  async cancelled(at: string, badge: string): Promise<string> {
    await this.ready(at);
    await this.page.getByRole('button', { name: english.home.start.haulOutCollection }).click();
    await this.page.getByRole('button', { name: said.split.normal }).click();
    await this.page.getByLabel(said.badge.label).fill(badge);
    await this.page.getByRole('button', { name: said.badge.start }).click();
    const number = await openedUnder(this.page);
    await this.page.getByRole('button', { name: said.open.cancel }).click();
    await expect(this.heading()).toHaveText(filled(said.open.cancelTitle, { number }));
    await this.look();
    await this.page.getByRole('button', { name: said.open.cancelYes }).click();
    await expect(this.heading()).toHaveText(english.home.title);
    return number;
  }

  // A ticket whose number the driver carries, opened at a tower: the badge, then the driver's
  // ticket scanned, or, where its barcode won't read, typed, the reason picked, typed again.
  async scanned(
    at: string,
    start: Extract<Start, 'disposal' | 'haulOutDisposal'>,
    badge: string,
    ticket: string | { readonly typed: string; readonly reason: string },
  ): Promise<void> {
    await this.ready(at);
    await this.page.getByRole('button', { name: english.home.start[start] }).click();
    await this.page.getByLabel(said.badge.label).fill(badge);
    await this.look();
    await this.page.getByRole('button', { name: said.badge.start }).click();
    await expect(this.heading()).toHaveText(said.number.ticketTitle);
    await this.look();
    if (typeof ticket === 'string') {
      await this.page.getByLabel(said.number.ticketLabel).fill(ticket);
    } else {
      await this.page.getByRole('button', { name: said.number.wontRead }).click();
      await keyed(this.page, ticket.typed);
      await this.look();
      await this.page.getByRole('button', { name: said.next }).click();
      await expect(this.heading()).toHaveText(said.number.reasonTitle);
      await this.look();
      await this.page.getByRole('option', { name: ticket.reason }).click();
      await keyed(this.page, ticket.typed);
    }
    await this.page.getByRole('button', { name: said.number.open }).click();
    const number = typeof ticket === 'string' ? ticket : ticket.typed;
    await expect(this.heading()).toHaveText(new RegExp(`\\b${number}$`));
    await this.look();
    await this.page.getByRole('button', { name: said.leave }).click();
    await expect(this.heading()).toHaveText(english.home.title);
  }

  // An open ticket completed from home's open list: its debris type picked; then what the site
  // asks of it (a collection's place, a split's ROE and estimate; a tower's load call, or a
  // haul-out's at its loading end, or so far for a pile; the scale receipt where it is weighed;
  // nothing more where the call was taken at the loading end); photos; the review; submitted.
  // Answers with the submitted screen's next property or pile where asked, else home.
  async completed(
    at: string,
    row: { readonly truck: string; readonly number: string; readonly suffix?: string },
    details: {
      readonly debris: string;
      readonly place?: { readonly typedAddress?: string };
      readonly roe?: string;
      readonly estimate?: string;
      readonly call?: string;
      readonly weighed?: {
        readonly receipt: string;
        readonly weights: readonly [string, string, string, string];
      };
      readonly then?: 'home' | 'next';
    },
  ): Promise<void> {
    await this.ready(at);
    const line =
      row.suffix === undefined
        ? filled(english.home.open.ticket, { truck: row.truck, number: row.number })
        : filled(english.home.open.split, { ...row, suffix: row.suffix });
    await this.page.getByText(line, { exact: true }).click();
    await this.look();
    await this.page.getByRole('button', { name: said.open.complete }).click();
    await expect(this.heading()).toHaveText(said.debris.title);
    await this.look();
    const debris = this.page.getByRole('option', { name: details.debris, exact: true });
    if ((await debris.getAttribute('aria-selected')) === 'true') {
      await this.page.getByRole('button', { name: said.next }).click();
    } else await debris.click();
    if (details.roe !== undefined) {
      await expect(this.heading()).toHaveText(said.roe.title);
      await this.page.getByLabel(said.roe.typeIt).fill(details.roe);
      await this.look();
      await this.page.getByRole('button', { name: said.next }).click();
    }
    if (details.estimate !== undefined) {
      await expect(this.heading()).toHaveText(said.estimate.title);
      await keyed(this.page, details.estimate);
      await this.look();
      await this.page.getByRole('button', { name: said.next }).click();
    }
    if (details.place !== undefined) {
      await expect(this.heading()).toHaveText(said.place.title);
      await this.page.getByRole('button', { name: said.place.capture }).click();
      await expect(this.page.getByText(/^GPS: /)).toBeVisible();
      if (details.place.typedAddress !== undefined) {
        await this.page.getByLabel(said.place.typed).fill(details.place.typedAddress);
      }
      await this.look();
      await this.page.getByRole('button', { name: said.next }).click();
    }
    if (details.call !== undefined) {
      await expect(this.heading()).toHaveText(
        new RegExp(
          `^(${[said.call.title, said.call.haulOutTitle, said.call.pileTitle].map(quoted).join('|')})$`,
        ),
      );
      await keyed(this.page, details.call);
      await this.look();
      await this.page.getByRole('button', { name: said.next }).click();
    }
    if (details.weighed !== undefined) {
      await expect(this.heading()).toHaveText(said.weight.title);
      await this.look();
      await this.page.getByRole('button', { name: said.next }).click();
      await expect(this.heading()).toHaveText(said.receipt.title);
      await this.page.getByLabel(said.receipt.number).fill(details.weighed.receipt);
      await this.look();
      await this.page.getByRole('button', { name: said.next }).click();
      await expect(this.heading()).toHaveText(said.receipt.weightsTitle);
      const fields = [said.receipt.gross, said.receipt.tare, said.receipt.net, said.receipt.tons];
      for (const [place, weight] of details.weighed.weights.entries()) {
        await this.page.getByLabel(fields[place] ?? '').fill(weight);
      }
      await this.look();
      await this.page.getByRole('button', { name: said.next }).click();
    }
    if (
      details.call === undefined &&
      details.weighed === undefined &&
      details.place === undefined
    ) {
      // A haul-out's disposal where its loading end's call is the quantity.
      await expect(this.heading()).toHaveText(said.nothing.title);
      await this.look();
      await this.page.getByRole('button', { name: said.next }).click();
    }
    await expect(this.heading()).toHaveText(said.photos.title);
    await this.look();
    await this.page.getByRole('button', { name: said.next }).click();
    await expect(this.heading()).toHaveText(said.review.title);
    await this.look();
    await this.page.getByRole('button', { name: said.review.submit }).click();
    await expect(
      this.page.getByText(filled(said.submitted.saved, { number: row.number })),
    ).toBeVisible();
    await this.look();
    if (details.then === 'next') {
      await this.page
        .getByRole('button', {
          name: new RegExp(
            `^(${[said.submitted.nextProperty, said.submitted.nextPile]
              .map((words) => quoted(words).replace(quoted('({number}-{suffix})'), '\\(.+\\)'))
              .join('|')})$`,
          ),
        })
        .click();
      await expect(this.heading()).toHaveText(new RegExp(`\\b${row.number}-[B-Z]$`));
      await this.page.getByRole('button', { name: said.leave }).click();
    } else {
      await this.page.getByRole('button', { name: said.submitted.home }).click();
    }
    await expect(this.heading()).toHaveText(english.home.title);
  }

  // ---------------------------------------------------------------------------------------------
  // Unit rate work: the crew first, then the work by name; each done while the crew does it.

  // A unit rate ticket, begun and completed: the crew's badge scanned with its photo, or the
  // working crew kept; the work by name; work photographed by stage at its dashboard (its
  // pre-work photo where no crew photo was taken, its measurement), other work on its own screen;
  // where it was done; the review; submitted for the crew. The number it opened under.
  async unitRate(
    begun: string,
    done: string,
    crew: { readonly scan: string } | { readonly same: string },
    work: string,
    details: {
      readonly measured?: { readonly way: 'around' | 'across'; readonly inches: string };
      readonly stump?: {
        readonly inches: string;
        // The root ball and whether half or more of it is exposed: none, and the phone asks no
        // exposure question (ADR-605).
        readonly rootBall: { readonly inches: string; readonly halfOrMore: boolean } | null;
        readonly survey: string | null;
      };
      readonly items?: readonly (readonly [string, string])[];
      readonly hours?: readonly (readonly [string, string])[];
      readonly typedAddress?: string;
    },
  ): Promise<string> {
    await this.ready(begun);
    const truck = 'scan' in crew ? crew.scan : crew.same;
    const crewLine = new RegExp(
      `^${quoted(english.home.open.crew)
        .replace(quoted('{truck}'), truck)
        .replace(quoted('{number}'), String.raw`(\d{6})`)}$`,
    );
    await this.page.getByRole('button', { name: english.home.start.unitRate }).click();
    if ('scan' in crew) {
      // No working crew yet: the crew's badge first; else the working crew offered, and changed.
      await expect(this.heading()).toHaveText(
        new RegExp(`^(${quoted(said.crew.title)}|${quoted(said.badge.crewTitle)})$`),
      );
      if ((await this.heading().textContent()) === said.crew.title) {
        await this.look();
        await this.page.getByRole('button', { name: said.crew.change }).click();
      }
      await expect(this.heading()).toHaveText(said.badge.crewTitle);
      await this.page.getByLabel(said.badge.label).fill(crew.scan);
      await this.look();
      await this.page.getByRole('button', { name: said.badge.crewStart }).click();
      await expect(this.heading()).toHaveText(said.crew.photoTitle);
      await photographed(this.page);
      await this.look();
      await this.page.getByRole('button', { name: said.next }).click();
    } else {
      await expect(this.heading()).toHaveText(said.crew.title);
      await this.page
        .getByRole('button', { name: filled(said.crew.same, { number: crew.same }) })
        .click();
    }
    await expect(this.heading()).toHaveText(said.work.title);
    const opened = this.page.getByText(crewLine);
    await expect(opened).toBeVisible();
    const number = crewLine.exec((await opened.textContent()) ?? '')?.[1] ?? '';
    await this.look();
    await this.page.getByRole('option', { name: work, exact: true }).click();

    const staged =
      details.measured !== undefined || details.stump !== undefined || work === 'Hangers';
    if (staged) {
      await expect(this.heading()).toHaveText(filled(said.open.title, { kind: work, number }));
      await this.look();
      if ('same' in crew) {
        await photographed(
          this.page,
          this.page.getByRole('button', { name: said.stages.take.PRE_WORK }),
        );
      }
    }
    await this.at(done);
    if (staged) {
      if (details.measured !== undefined) {
        await this.page.getByRole('button', { name: said.stages.measure }).click();
        await expect(this.heading()).toHaveText(said.stages.measurePhotoTitle);
        await this.look();
        await this.page.getByRole('button', { name: said.next }).click();
        await expect(this.heading()).toHaveText(said.measure.howTitle);
        await this.look();
        await this.page
          .getByRole('option', { name: said.measure[details.measured.way], exact: true })
          .click();
        await expect(this.heading()).toHaveText(said.measure.inchesTitle);
        await keyed(this.page, details.measured.inches);
        await this.look();
        await this.page.getByRole('button', { name: said.next }).click();
      }
      if (details.stump !== undefined) {
        const { stump } = details;
        await this.page.getByRole('button', { name: said.stages.measure }).click();
        await expect(this.heading()).toHaveText(said.stages.measurePhotoTitle);
        await this.page.getByRole('button', { name: said.next }).click();
        await expect(this.heading()).toHaveText(said.stump.title);
        await keyed(this.page, stump.inches);
        await this.look();
        await this.page.getByRole('button', { name: said.next }).click();
        await expect(this.heading()).toHaveText(said.stump.rootBallTitle);
        if (stump.rootBall !== null) await keyed(this.page, stump.rootBall.inches);
        await this.page.getByRole('button', { name: said.next }).click();
        if (stump.rootBall !== null) {
          await expect(this.heading()).toHaveText(said.stump.exposedTitle);
          await this.look();
          await this.page
            .getByRole('option', {
              name: stump.rootBall.halfOrMore ? said.stump.halfOrMore : said.stump.lessThanHalf,
              exact: true,
            })
            .click();
        }
        await expect(this.heading()).toHaveText(said.stump.surveyTitle);
        if (stump.survey !== null) {
          await this.page.getByLabel(said.stump.surveyLabel).fill(stump.survey);
        }
        await this.look();
        await this.page
          .getByRole('button', {
            name: stump.survey === null ? said.stump.surveyNone : said.next,
          })
          .click();
      }
      await expect(this.heading()).toHaveText(filled(said.open.title, { kind: work, number }));
      await this.page.getByRole('button', { name: said.open.complete }).click();
    } else {
      const items = details.items ?? details.hours ?? [];
      await expect(this.heading()).toHaveText(
        details.hours === undefined ? said.items.countsTitle : said.items.hoursTitle,
      );
      for (const [item, quantity] of items) {
        const label = details.hours === undefined ? item : filled(said.items.hours, { item });
        await this.page.getByLabel(label, { exact: true }).fill(quantity);
      }
      await this.look();
      await this.page.getByRole('button', { name: said.next }).click();
    }
    await expect(this.heading()).toHaveText(said.place.workTitle);
    if (details.typedAddress !== undefined) {
      await this.page.getByLabel(said.place.typed).fill(details.typedAddress);
    }
    await this.look();
    await this.page.getByRole('button', { name: said.next }).click();
    if (!staged) {
      await expect(this.heading()).toHaveText(said.photos.title);
      await this.look();
      await this.page.getByRole('button', { name: said.next }).click();
    }
    await expect(this.heading()).toHaveText(said.review.title);
    await this.look();
    await this.page
      .getByRole('button', { name: filled(said.review.submitCrew, { number: truck }) })
      .click();
    await expect(this.page.getByText(filled(said.submitted.saved, { number }))).toBeVisible();
    await this.page.getByRole('button', { name: said.submitted.home }).click();
    await expect(this.heading()).toHaveText(english.home.title);
    return number;
  }

  // ---------------------------------------------------------------------------------------------
  // The forms that are no ticket's.

  // An ROE made from its signed paper, which has its own number: typed, and typed again; the
  // property, the day it was signed, a photo of the signed form.
  async roe(
    at: string,
    roe: {
      readonly number: string;
      readonly parcel: string;
      readonly owner: string;
      readonly address: string;
      readonly signedDay: string;
    },
  ): Promise<void> {
    await this.ready(at);
    await this.page.getByRole('button', { name: english.home.start.roe }).click();
    await expect(this.heading()).toHaveText(forms.roeNumber.againTitle);
    await this.look();
    await this.page.getByRole('button', { name: forms.roeNumber.paper }).click();
    await expect(this.heading()).toHaveText(forms.roeNumber.paperTitle);
    await this.page.getByLabel(forms.roeNumber.paperLabel).fill(roe.number);
    await this.page.getByLabel(forms.roeNumber.paperAgain).fill(roe.number);
    await this.look();
    await this.page.getByRole('button', { name: forms.roeNumber.open }).click();
    await expect(this.heading()).toHaveText(forms.roe.propertyTitle);
    await this.page.getByLabel(forms.roe.parcel).fill(roe.parcel);
    await this.page.getByLabel(forms.roe.owner).fill(roe.owner);
    await this.page.getByLabel(forms.roe.address).fill(roe.address);
    await this.look();
    await this.page.getByRole('button', { name: said.next }).click();
    await expect(this.heading()).toHaveText(forms.roe.signedTitle);
    await this.page.getByRole('option', { name: forms.roe.signedBefore, exact: true }).click();
    await this.page.getByLabel(forms.roe.signedDay).fill(roe.signedDay);
    await this.look();
    await this.page.getByRole('button', { name: said.next }).click();
    await expect(this.heading()).toHaveText(forms.roe.photoTitle);
    await photographed(this.page);
    await this.look();
    await this.page.getByRole('button', { name: said.next }).click();
    await this.formSubmitted(forms.review.title.ROE, `ROE ${roe.number}`);
  }

  // A survey on an ROE: pre-work, on the ROE typed by its number; post-work, on the ROE picked
  // from those whose pre-work survey is done; no survey number; where it was; no photo or note.
  async survey(at: string, workType: 'Pre-work survey' | 'Post-work survey', roe: string) {
    await this.ready(at);
    await this.page.getByRole('button', { name: english.home.start.survey }).click();
    await expect(this.heading()).toHaveText(forms.survey.typeTitle);
    await this.look();
    await this.page.getByRole('option', { name: workType, exact: true }).click();
    await expect(this.heading()).toHaveText(forms.survey.roeTitle);
    if (workType === 'Pre-work survey') {
      await this.page.getByLabel(said.roe.typeIt).fill(roe);
    } else {
      await this.page.getByRole('option', { name: new RegExp(`^${quoted(roe)}`) }).click();
    }
    await this.look();
    await this.page.getByRole('button', { name: said.next }).click();
    await expect(this.heading()).toHaveText(forms.survey.numberTitle);
    await this.look();
    await this.page.getByRole('button', { name: forms.survey.numberNone }).click();
    await this.formPlaced(forms.place.title);
    await this.formEnd(forms.review.title.SURVEY, workType, false);
  }

  // An incident: its type, then the firm's sub-type; no contractor named; the truck's cert
  // number; where it happened; a photo.
  async incident(
    at: string,
    incident: {
      readonly type: string;
      readonly subType: string;
      readonly certNumber: string;
      readonly typedAddress: string;
    },
  ): Promise<void> {
    await this.ready(at);
    await this.page.getByRole('button', { name: english.home.start.incident }).click();
    await expect(this.heading()).toHaveText(forms.incident.typeTitle);
    await this.look();
    await this.page.getByRole('option', { name: incident.type, exact: true }).click();
    await expect(this.heading()).toHaveText(
      filled(forms.incident.subTypeTitle, { type: incident.type }),
    );
    await this.look();
    await this.page.getByRole('option', { name: incident.subType, exact: true }).click();
    await expect(this.heading()).toHaveText(forms.incident.detailsTitle);
    await this.look();
    await this.page.getByRole('button', { name: said.next }).click();
    await expect(this.heading()).toHaveText(forms.incident.contractorTitle);
    await this.look();
    await this.page.getByRole('button', { name: forms.incident.contractorNone }).click();
    await expect(this.heading()).toHaveText(forms.incident.certTitle);
    await this.page.getByLabel(forms.incident.certLabel).fill(incident.certNumber);
    await this.look();
    await this.page.getByRole('button', { name: said.next }).click();
    await this.formPlaced(forms.incident.placeTitle, incident.typedAddress);
    await this.formEnd(forms.review.title.INCIDENT, `Incident · ${incident.type}`, true);
  }

  // A citizen drop-off log at the assignment's site: the resident and where the debris came
  // from; where it was made; a photo.
  async dropOff(
    at: string,
    log: { readonly residentName: string; readonly origin: string },
  ): Promise<void> {
    await this.ready(at);
    await this.page.getByRole('button', { name: english.home.start.dropOff }).click();
    await expect(this.heading()).toHaveText(forms.dropOff.residentTitle);
    await this.page.getByLabel(forms.dropOff.residentName).fill(log.residentName);
    await this.page.getByLabel(forms.dropOff.origin).fill(log.origin);
    await this.look();
    await this.page.getByRole('button', { name: said.next }).click();
    await this.formPlaced(forms.dropOff.placeTitle);
    await this.formEnd(forms.review.title.DROP_OFF_LOG, 'Drop-off log', true);
  }

  // ---------------------------------------------------------------------------------------------

  private heading() {
    return this.page.getByRole('heading', { level: 1 });
  }

  // The screen showing checked, the first time the run meets it.
  private async look(): Promise<void> {
    const screen = await this.page.locator(`[${screenAttribute}]`).getAttribute(screenAttribute);
    if (screen === null || checked.has(screen)) return;
    checked.add(screen);
    await checkScreen(this.page);
  }

  // The phone at that moment, on home with its monitor signed in.
  private async ready(at: string): Promise<void> {
    await this.at(at);
    if (!this.signedIn) {
      if (this.monitor === null) throw new Error(`Nobody has signed in on ${this.name} yet.`);
      if (this.online) await this.signedInOnline(this.monitor, 0);
      else await this.signedInOffline(this.monitor);
    }
    await expect(this.heading()).toHaveText(english.home.title);
  }

  // Signed in with signal: the sign-in, its sync, the lists and the login list answered, and the
  // first blocks' sync where the phone asks for them.
  private async signedInOnline(monitor: MissionMonitor, firstBlocks: number): Promise<void> {
    const from = toApi(this.asked).length;
    await this.signIn(monitor);
    const since = () => toApi(this.asked).slice(from);
    await expect
      .poll(() =>
        since().some(({ path, status }) => path === '/phones/current/login-list' && status === 200),
      )
      .toBe(true);
    await expect
      .poll(() => since().filter(({ path }) => path === '/phones/current/syncs').length)
      .toBeGreaterThanOrEqual(1 + firstBlocks);
    await expect.poll(() => since().every(({ status }) => status === 200)).toBe(true);
    await expect(this.page.getByText(english.work.synced.now)).toBeVisible();
  }

  // Signed in with no signal, from the login list the phone holds.
  private async signedInOffline(monitor: MissionMonitor): Promise<void> {
    await this.signIn(monitor);
  }

  private async signIn(monitor: MissionMonitor): Promise<void> {
    await this.page.getByLabel(english.phone.monitorNumber).fill(monitor.monitorNumber);
    await this.page.getByLabel(english.phone.passwordLabel).fill(monitor.password);
    await this.look();
    await this.page.getByRole('button', { name: english.phone.signIn }).click();
    await expect(this.heading()).toHaveText(english.home.title);
    this.monitor = monitor;
    this.signedIn = true;
  }

  // A form's place: the phone's fix, and a street typed where there is one.
  private async formPlaced(title: string, typedAddress?: string): Promise<void> {
    await expect(this.heading()).toHaveText(title);
    await this.page.getByRole('button', { name: said.place.capture }).click();
    await expect(this.page.getByText(/^GPS: /)).toBeVisible();
    if (typedAddress !== undefined) {
      await this.page.getByLabel(said.place.typed).fill(typedAddress);
    }
    await this.look();
    await this.page.getByRole('button', { name: said.next }).click();
  }

  // A form's photos (one taken where asked), its notes left empty, its review, submitted.
  private async formEnd(review: string, kind: string, photo: boolean): Promise<void> {
    await expect(this.heading()).toHaveText(forms.photosTitle);
    if (photo) await photographed(this.page);
    await this.look();
    await this.page.getByRole('button', { name: said.next }).click();
    await expect(this.heading()).toHaveText(forms.notes.title);
    await this.look();
    await this.page.getByRole('button', { name: said.next }).click();
    await this.formSubmitted(review, kind);
  }

  private async formSubmitted(review: string, kind: string): Promise<void> {
    await expect(this.heading()).toHaveText(review);
    await this.look();
    await this.page.getByRole('button', { name: forms.review.submit }).click();
    await expect(this.heading()).toHaveText(filled(forms.submitted.title, { kind }));
    await this.look();
    await this.page.getByRole('button', { name: forms.submitted.home }).click();
    await expect(this.heading()).toHaveText(english.home.title);
  }
}
