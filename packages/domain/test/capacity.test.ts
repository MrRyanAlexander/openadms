// A container's capacity from its measured boxes, at the domain (spec/acceptance/03-certification.md
// section D, AC-03-21…29, 31 and 32; adms-certifications §3A.3; ADR-076, 078, 082, 087, 320). The
// figures are that page's own, each worked there step by step; the example world's three containers
// are spec/CONVENTIONS.md §6's. Nothing here comes from `development/`.
import { describe, expect, it } from 'vitest';

import { Capacity, type BoxSign, type MeasuredBox } from '../src/index.ts';

const blank = {
  length: null,
  secondLength: null,
  width: null,
  height: null,
  diameter: null,
  radius: null,
  run: null,
  corners: null,
};

const primary = (length: number, width: number, height: number): MeasuredBox => ({
  ...blank,
  position: 0,
  shape: 'RECTANGLE',
  sign: 'ADD',
  length,
  width,
  height,
});

const rectangle = (
  position: number,
  sign: BoxSign,
  length: number,
  width: number,
  height: number,
): MeasuredBox => ({ ...blank, position, shape: 'RECTANGLE', sign, length, width, height });

const triangle = (
  position: number,
  sign: BoxSign,
  length: number,
  width: number,
  height: number,
): MeasuredBox => ({ ...blank, position, shape: 'TRIANGLE', sign, length, width, height });

const hoist = (
  position: number,
  sign: BoxSign,
  length: number,
  secondLength: number,
  width: number,
  height: number,
): MeasuredBox => ({
  ...blank,
  position,
  shape: 'TWO_LENGTH_HOIST',
  sign,
  length,
  secondLength,
  width,
  height,
});

const roundBottom = (
  position: number,
  sign: BoxSign,
  diameter: number,
  length: number,
): MeasuredBox => ({ ...blank, position, shape: 'ROUND_BOTTOM', sign, diameter, length });

const radiusCorner = (
  position: number,
  radius: number,
  run: number,
  corners: number,
  sign: BoxSign = 'SUBTRACT',
): MeasuredBox => ({ ...blank, position, shape: 'RADIUS_CORNER', sign, radius, run, corners });

const container = (...boxes: MeasuredBox[]) => new Capacity('CONTAINER', boxes).work();

// A big primary box, so one box after it can be read on its own line.
const withBox = (box: MeasuredBox) => container(primary(240, 90, 60), box).boxes[1]?.cubicInches;

describe('the worked example', () => {
  it('AC-03-21 a primary box, sideboards added and a dog box ÷2 subtracted are 1,501,200 cu in, 32.18, 32 CY', () => {
    expect(
      container(
        primary(240, 90, 60),
        rectangle(1, 'ADD', 240, 90, 12),
        triangle(2, 'SUBTRACT', 30, 90, 40),
      ),
    ).toEqual({
      capacityCy: 32,
      boxes: [
        { position: 0, sign: 'ADD', cubicInches: '1296000.00' },
        { position: 1, sign: 'ADD', cubicInches: '259200.00' },
        { position: 2, sign: 'SUBTRACT', cubicInches: '54000.00' },
      ],
      totalCubicInches: '1501200.00',
      cubicYards: '32.18',
      refusal: null,
    });
  });
});

describe('whole inches', () => {
  it('AC-03-22 a measurement with a fraction of an inch (59.5) isn’t taken', () => {
    expect(container(primary(240, 90, 59.5))).toEqual({
      capacityCy: null,
      boxes: [],
      totalCubicInches: null,
      cubicYards: null,
      refusal: {
        code: 'MEASUREMENT_INVALID',
        message:
          'The primary box: its height is 59.5. Every measurement is a whole number of inches, 1 or more.',
        position: 0,
      },
    });
  });
});

describe('each shape', () => {
  it('AC-03-23 a box marked ÷2 (a triangle) of 30 × 90 × 40 is 54,000.00 cu in; unmarked, 108,000.00', () => {
    expect(withBox(triangle(1, 'SUBTRACT', 30, 90, 40))).toBe('54000.00');
    expect(withBox(rectangle(1, 'SUBTRACT', 30, 90, 40))).toBe('108000.00');
  });

  it('AC-03-24 a hoist of two lengths, 30 and 21, 20 wide and 36 high, is 25.50 × 20 × 36 = 18,360.00 cu in', () => {
    expect(withBox(hoist(1, 'SUBTRACT', 30, 21, 20, 36))).toBe('18360.00');
  });

  it('AC-03-24 a hoist with no second length isn’t worked out: the monitor enters both', () => {
    expect(
      container(primary(240, 90, 60), {
        ...hoist(1, 'SUBTRACT', 30, 21, 20, 36),
        secondLength: null,
      }).refusal,
    ).toEqual({
      code: 'MEASUREMENT_INVALID',
      message:
        'Box 1 (two-length hoist): its second length is missing. Every measurement is a whole number of inches, 1 or more.',
      position: 1,
    });
  });

  it('AC-03-25 a round bottom of diameter 90 and length 240 is a half cylinder with π as 3.14: 763,020.00 cu in', () => {
    expect(withBox(roundBottom(1, 'ADD', 90, 240))).toBe('763020.00');
  });

  it('AC-03-26 radius corners of R 12 with a run of 60, two of them, are 3,715.20 cu in', () => {
    expect(withBox(radiusCorner(1, 12, 60, 2))).toBe('3715.20');
  });

  it('AC-03-26 a radius corner is always subtracted: one marked "add" is refused', () => {
    expect(container(primary(240, 90, 60), radiusCorner(1, 12, 60, 2, 'ADD'))).toEqual({
      capacityCy: null,
      boxes: [],
      totalCubicInches: null,
      cubicYards: null,
      refusal: {
        code: 'RADIUS_CORNER_ADDED',
        message: 'Box 1 (radius corner): a radius corner is always subtracted.',
        position: 1,
      },
    });
  });
});

describe('hundredths at each step, then a whole cubic yard', () => {
  it('AC-03-27 radius corners of R 5 with a run of 48, four of them, are 1,031.04 cu in, never 1,032.00', () => {
    expect(withBox(radiusCorner(1, 5, 48, 4))).toBe('1031.04');
  });

  it('AC-03-27 a round bottom of an odd diameter rounds after × 3.14 and after ÷ 2', () => {
    // 91 ÷ 2 = 45.50; 45.50² = 2,070.25; × 3.14 = 6,500.585 → 6,500.59; × 241 = 1,566,642.19;
    // ÷ 2 = 783,321.095 → 783,321.10 (rounding only at the end gives 783,320.49).
    expect(withBox(roundBottom(1, 'ADD', 91, 241))).toBe('783321.10');
  });

  it('AC-03-28 1,516,200 cu in ÷ 46,656 = 32.4974… → 32.50 → 33 CY: hundredths first, then .5 up', () => {
    const reading = container(primary(240, 90, 70), rectangle(1, 'ADD', 21, 20, 10));
    expect(reading.totalCubicInches).toBe('1516200.00');
    expect(reading.cubicYards).toBe('32.50');
    expect(reading.capacityCy).toBe(33);
  });

  it('AC-03-28 the primary box alone, 1,512,000 cu in, is 32.41 and 32 CY', () => {
    const reading = container(primary(240, 90, 70));
    expect(reading.cubicYards).toBe('32.41');
    expect(reading.capacityCy).toBe(32);
  });
});

describe('boxes 1…N', () => {
  it('AC-03-29 a primary box and seven more are all taken, in order, whatever order they are handed over in', () => {
    const reading = container(
      rectangle(7, 'ADD', 21, 20, 10),
      radiusCorner(6, 5, 48, 4),
      radiusCorner(5, 12, 60, 2),
      roundBottom(4, 'ADD', 90, 240),
      hoist(3, 'SUBTRACT', 30, 21, 20, 36),
      triangle(2, 'SUBTRACT', 30, 90, 40),
      rectangle(1, 'ADD', 240, 90, 12),
      primary(240, 90, 60),
    );
    expect(reading.boxes).toEqual([
      { position: 0, sign: 'ADD', cubicInches: '1296000.00' },
      { position: 1, sign: 'ADD', cubicInches: '259200.00' },
      { position: 2, sign: 'SUBTRACT', cubicInches: '54000.00' },
      { position: 3, sign: 'SUBTRACT', cubicInches: '18360.00' },
      { position: 4, sign: 'ADD', cubicInches: '763020.00' },
      { position: 5, sign: 'SUBTRACT', cubicInches: '3715.20' },
      { position: 6, sign: 'SUBTRACT', cubicInches: '1031.04' },
      { position: 7, sign: 'ADD', cubicInches: '4200.00' },
    ]);
    expect(reading.totalCubicInches).toBe('2245313.76');
    expect(reading.cubicYards).toBe('48.12');
    expect(reading.capacityCy).toBe(48);
  });
});

describe('the example world’s containers', () => {
  it('AC-03-31 730415, Coastline’s dump trailer, works out to 65 CY', () => {
    const reading = container(primary(360, 96, 72), rectangle(1, 'ADD', 360, 96, 16));
    expect(reading.totalCubicInches).toBe('3041280.00');
    expect(reading.cubicYards).toBe('65.19');
    expect(reading.capacityCy).toBe(65);
  });

  it('AC-03-31 730416, Rivera’s self-loader, works out to 48 CY', () => {
    const reading = container(primary(264, 92, 96), triangle(1, 'SUBTRACT', 36, 92, 48));
    expect(reading.totalCubicInches).toBe('2252160.00');
    expect(reading.cubicYards).toBe('48.27');
    expect(reading.capacityCy).toBe(48);
  });

  it('AC-03-31 730419, Coastline’s walking floor, works out to 110 CY', () => {
    const reading = container(primary(576, 96, 93), radiusCorner(1, 6, 576, 2));
    expect(reading.boxes[1]?.cubicInches).toBe('8916.48');
    expect(reading.totalCubicInches).toBe('5133611.52');
    expect(reading.cubicYards).toBe('110.03');
    expect(reading.capacityCy).toBe(110);
  });
});

describe('a crew', () => {
  it('AC-03-32 has nothing to measure and no capacity: not zero, none', () => {
    expect(new Capacity('CREW', []).work()).toEqual({
      capacityCy: null,
      boxes: [],
      totalCubicInches: null,
      cubicYards: null,
      refusal: null,
    });
  });

  it('AC-03-32 handed a box, still has no capacity, and says a crew is not measured', () => {
    const reading = new Capacity('CREW', [primary(240, 90, 60)]).work();
    expect(reading.capacityCy).toBeNull();
    expect(reading.refusal).toEqual({
      code: 'CREW_MEASURED',
      message: 'A crew is not measured: it has no boxes and no capacity.',
      position: null,
    });
  });
});

describe('measurements no capacity comes from (ADR-320)', () => {
  it('a measurement of zero, or under, is no measurement', () => {
    expect(container(primary(240, 0, 60)).refusal?.message).toBe(
      'The primary box: its width is 0. Every measurement is a whole number of inches, 1 or more.',
    );
    expect(container(primary(240, 90, 60), radiusCorner(1, 12, 60, 0)).refusal?.message).toBe(
      'Box 1 (radius corner): its number of corners is 0. Every measurement is a whole number, 1 or more.',
    );
    expect(container(primary(-240, 90, 60)).refusal?.code).toBe('MEASUREMENT_INVALID');
  });

  it('a missing measurement gives no capacity, never a guess', () => {
    const reading = container({ ...primary(240, 90, 60), length: null });
    expect(reading.capacityCy).toBeNull();
    expect(reading.refusal?.message).toBe(
      'The primary box: its length is missing. Every measurement is a whole number of inches, 1 or more.',
    );
  });

  it('a shape reads only its own measurements', () => {
    expect(withBox({ ...roundBottom(1, 'ADD', 90, 240), width: 0, height: null })).toBe(
      '763020.00',
    );
  });

  it('boxes that subtract as much as the primary holds, or more, give no capacity, and the lines are shown', () => {
    expect(container(primary(100, 50, 20), rectangle(1, 'SUBTRACT', 100, 50, 30))).toEqual({
      capacityCy: null,
      boxes: [
        { position: 0, sign: 'ADD', cubicInches: '100000.00' },
        { position: 1, sign: 'SUBTRACT', cubicInches: '150000.00' },
      ],
      totalCubicInches: '-50000.00',
      cubicYards: null,
      refusal: {
        code: 'NOTHING_HELD',
        message:
          'The boxes work out to -50000.00 cu in: they subtract as much as the primary box holds, or more. Check the measurements.',
        position: null,
      },
    });
    expect(
      container(primary(100, 50, 20), rectangle(1, 'SUBTRACT', 100, 50, 20)).refusal?.code,
    ).toBe('NOTHING_HELD');
  });

  it('a container has one primary box, a rectangle that adds', () => {
    expect(container().refusal?.code).toBe('NO_PRIMARY_BOX');
    expect(container(rectangle(1, 'ADD', 240, 90, 12)).refusal?.code).toBe('NO_PRIMARY_BOX');
    expect(container(primary(240, 90, 60), primary(240, 90, 60)).refusal?.code).toBe(
      'NO_PRIMARY_BOX',
    );
    expect(container(triangle(0, 'ADD', 240, 90, 60)).refusal?.code).toBe('PRIMARY_BOX_INVALID');
    expect(container(rectangle(0, 'SUBTRACT', 240, 90, 60)).refusal?.code).toBe(
      'PRIMARY_BOX_INVALID',
    );
  });

  it('a container too small for half a cubic yard works out to 0 CY, as its measurements say', () => {
    const reading = container(primary(20, 20, 20));
    expect(reading.cubicYards).toBe('0.17');
    expect(reading.capacityCy).toBe(0);
  });
});
