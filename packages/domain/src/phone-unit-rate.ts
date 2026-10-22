// What a phone asks of a unit rate ticket (adms-field-app §4A.4, §4A.6; adms-ticket-workflows
// §4.5; spec/acceptance/11-field-app.md AC-11-43; REQ-112b, 306, 320; ADR-207, 210, 213, 217,
// 583). One rule for every phone, from the unit rate pay items its assignment names, each with
// its payable type, its kind of work and its capture settings: never a rate.
//
// - **The payable types, each once** (ADR-207, 213): the monitor picks the work by name, never a
//   pay item or a code; a payable type is offered while one of its pay items is live.
// - **The kind of work picks the screen** (REQ-112b; ADR-040, 084, 198): Stumps by its built-in
//   key, never its name (the stump's diameter two feet up, its root ball, "half or more exposed",
//   its survey number); "half or more exposed" is the root ball's (ADR-198), so it is asked only
//   where a root ball is measured, and the answer goes with it (ADR-605, agent default); items with a count each; items with hours each; otherwise a count. A
//   payable type's kind of work is its pay items' (kinds never mix on a ticket, ADR-213).
// - **A count is asked unless each of its pay items is always one**, in whole numbers unless one
//   of them allows decimals; an itemised ticket's items hold it (ADR-157, 158).
// - **A tree is measured, around or across** (ADR-177), where one of its pay items asks for a
//   measurement or has a band to tell it from another; a stump always, across only (ADR-198).
// - **The pay item is worked out from the bands** (`SizeBands.payItemFor`, invariant 11): the
//   phone's answer is what prints; the worker works it out again and bills that (ADR-217).
// - **"Ineligible" is offered where the pay item allows the monitor to mark it** (ADR-210): the
//   pay item worked out, or, where none is, any of the payable type's.
// - **Photographed by stage where its kind of work says so** (the user, ADR-590): before the
//   work, its measurement and after it, each its own photograph, the work left and come back to
//   between them; the firm's setting on the kind of work, on as shipped for Hangers, Leaners and
//   Stumps.
//
// Nothing here refuses anything (ADR-052): a missing measurement, a count with decimals and work
// marked ineligible are each flagged after sync, never stopped on the phone.
import type { BuiltInKey } from './built-in-keys.ts';
import type { Named } from './checks.ts';
import { SizeBands, type BandedPayItem, type TreeMeasurement } from './size-bands.ts';
import type { CountShapeName } from './unit-rate-checks.ts';

// A kind of work, as a phone holds it.
export interface PhoneKindOfWork extends Named {
  readonly key: BuiltInKey<'kindOfWork'> | null;
  readonly countShape: CountShapeName;
  // Its photographs taken by stage: before, the measurement, after (ADR-590).
  readonly photosByStage: boolean;
}

// A unit rate pay item, as a phone holds it: its code only to print, never to show.
export interface PhoneUnitRatePayItem extends BandedPayItem {
  readonly payableType: Named;
  readonly kindOfWork: PhoneKindOfWork;
  readonly countIsAlwaysOne: boolean;
  readonly measurementRequired: boolean;
  readonly decimalsAllowed: boolean;
  readonly monitorMayMarkIneligible: boolean;
}

// The screen a kind of work takes.
export type UnitRateScreen = 'COUNT' | 'STUMP' | 'ITEM_COUNTS' | 'ITEM_HOURS';

// What the phone asks of one payable type's work.
export interface UnitRateAsked {
  readonly payableType: Named;
  readonly kindOfWork: PhoneKindOfWork;
  readonly screen: UnitRateScreen;
  // Asked; one, recorded and never asked; or none, the items holding it.
  readonly count: 'ASKED' | 'ONE' | 'NONE';
  // Whether a count, or an item's count, may have decimals: hours always may.
  readonly decimals: boolean;
  // A tree's measurement (around or across), a stump's (across), or none.
  readonly measured: 'TREE' | 'STUMP' | 'NONE';
  // Whether its photographs are taken by stage: before, the measurement, after (ADR-590).
  readonly photosByStage: boolean;
}

// A stump's measurement as the phone holds it: across two feet up, its root ball, and whether half
// or more of the root ball is exposed (ADR-198).
export interface StumpEntered {
  readonly diameterInches: number | null;
  readonly rootBallInches: number | null;
  readonly rootBallHalfExposed: boolean | null;
}

// A quarter of an hour, in hundredths: crew time's hours go to the quarter hour (ADR-084).
const quarterHundredths = 25;

export class PhoneUnitRate {
  private readonly payItems: readonly PhoneUnitRatePayItem[];

  constructor(payItems: readonly PhoneUnitRatePayItem[]) {
    this.payItems = payItems;
  }

  // The payable types the monitor picks from, each once, in the order the pay items came.
  payableTypes(): Named[] {
    const picked = new Map<string, Named>();
    for (const { payableType } of this.live()) {
      if (!picked.has(payableType.id)) {
        picked.set(payableType.id, { id: payableType.id, name: payableType.name });
      }
    }
    return [...picked.values()];
  }

  // What the phone asks of a payable type's work; none where the phone holds no live pay item of
  // it.
  asks(payableTypeId: string): UnitRateAsked | null {
    const ofIt = this.live().filter(({ payableType }) => payableType.id === payableTypeId);
    const [first] = ofIt;
    if (first === undefined) return null;
    const { kindOfWork } = first;
    const decimals = ofIt.some((payItem) => payItem.decimalsAllowed);
    const kind = {
      payableType: first.payableType,
      kindOfWork,
      decimals,
      photosByStage: kindOfWork.photosByStage,
    };
    if (kindOfWork.countShape === 'ITEM_COUNTS') {
      return { ...kind, screen: 'ITEM_COUNTS', count: 'NONE', measured: 'NONE' };
    }
    if (kindOfWork.countShape === 'ITEM_HOURS') {
      return { ...kind, screen: 'ITEM_HOURS', count: 'NONE', decimals: true, measured: 'NONE' };
    }
    const count = ofIt.every((payItem) => payItem.countIsAlwaysOne) ? 'ONE' : 'ASKED';
    if (kindOfWork.key === 'STUMPS') return { ...kind, screen: 'STUMP', count, measured: 'STUMP' };
    const measured = ofIt.some(
      (payItem) =>
        payItem.measurementRequired || payItem.bandFrom !== null || payItem.bandTo !== null,
    );
    return { ...kind, screen: 'COUNT', count, measured: measured ? 'TREE' : 'NONE' };
  }

  // The pay item the work falls to, from the payable type's bands: what the phone prints.
  payItemFor(
    payableTypeId: string,
    measurement: TreeMeasurement | null,
  ): PhoneUnitRatePayItem | null {
    const ofIt = this.payItems.filter(({ payableType }) => payableType.id === payableTypeId);
    const [first] = ofIt;
    if (first === undefined) return null;
    const found = new SizeBands(first.payableType.name, ofIt).payItemFor(measurement).payItem;
    return ofIt.find(({ id }) => id === found?.id) ?? null;
  }

  // Whether the monitor may mark this work ineligible: the pay item's own setting, or where none
  // is worked out, any of the payable type's.
  mayMarkIneligible(payableTypeId: string, measurement: TreeMeasurement | null): boolean {
    const payItem = this.payItemFor(payableTypeId, measurement);
    if (payItem !== null) return payItem.monitorMayMarkIneligible;
    return this.live().some(
      (one) => one.payableType.id === payableTypeId && one.monitorMayMarkIneligible,
    );
  }

  // Whether hours typed are to the quarter hour, as crew time takes them (ADR-084).
  static quarterHour(hours: number): boolean {
    const hundredths = Math.round(hours * 100);
    return Math.abs(hours * 100 - hundredths) < 1e-6 && hundredths % quarterHundredths === 0;
  }

  // Whether the phone asks "is half or more of the root ball exposed?": the question is the root
  // ball's (ADR-198), so it is asked only where a root ball is measured (ADR-605).
  static asksExposure(rootBallInches: number | null): boolean {
    return rootBallInches !== null;
  }

  // A stump's root ball entered, or left empty, with the exposure answer it keeps: none once there
  // is no root ball to answer it of (ADR-605).
  static rootBallEntered(
    rootBallInches: number | null,
    rootBallHalfExposed: boolean | null,
  ): Pick<StumpEntered, 'rootBallInches' | 'rootBallHalfExposed'> {
    return {
      rootBallInches,
      rootBallHalfExposed: PhoneUnitRate.asksExposure(rootBallInches) ? rootBallHalfExposed : null,
    };
  }

  // Whether a stump's measurement is entered: its diameter two feet up, and the exposure answered
  // where a root ball is measured (ADR-605). A blank root ball (and a blank survey number) is the
  // monitor's to leave: flagged after sync where the setup asks for one, never stopped (ADR-052,
  // 198, 203).
  static stumpMeasured(stump: StumpEntered): boolean {
    if (stump.diameterInches === null) return false;
    return !PhoneUnitRate.asksExposure(stump.rootBallInches) || stump.rootBallHalfExposed !== null;
  }

  private live(): readonly PhoneUnitRatePayItem[] {
    return this.payItems.filter(({ archived }) => !archived);
  }
}
