// A container's certified capacity, worked out from its measured boxes exactly as the firm's paper
// form does (adms-certifications §3A.3, user-confirmed; spec/parts/03-certification.md steps 7–8;
// spec/DATA-MODEL.md §3 "CertificationBox"; ADR-076, 078, 082, 087, 320). Whole inches; the primary
// box, then boxes 1…N, each a shape that adds or subtracts; π is 3.14; every step is rounded to
// hundredths, a half up; the total ÷ 46,656 is the cubic yards; the capacity is that to the nearest
// whole cubic yard, .5 up. Nobody types a capacity: a wrong one is fixed by fixing a measurement.
// A crew has nothing to measure and no capacity: not zero, none (invariant 10).
//
// It lives once, here, for the certifying phone and the server (invariant 11). Never
// `development/`'s truck-capacity section, which is wrong (the user, 2026-09-24).
//
// "A step" is each single operation of a shape's formula, in the order §3A.3 writes it (ADR-320).
// The arithmetic is exact: whole hundredths, never floating point.

export const boxShapes = [
  'RECTANGLE',
  'TRIANGLE',
  'TWO_LENGTH_HOIST',
  'ROUND_BOTTOM',
  'RADIUS_CORNER',
] as const;
export type BoxShape = (typeof boxShapes)[number];

export const boxSigns = ['ADD', 'SUBTRACT'] as const;
export type BoxSign = (typeof boxSigns)[number];

export type CertificationKind = 'CONTAINER' | 'CREW';

// One measured box, as the certification keeps it. Position 0 is the primary. A shape reads only
// its own measurements: a rectangle and a triangle their length, width and height; a two-length
// hoist both lengths, width and height; a round bottom its diameter and length; a radius corner its
// radius, its run and how many corners.
export interface MeasuredBox {
  readonly position: number;
  readonly shape: BoxShape;
  readonly sign: BoxSign;
  readonly length: number | null;
  readonly secondLength: number | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly diameter: number | null;
  readonly radius: number | null;
  readonly run: number | null;
  readonly corners: number | null;
}

// What one box works out to, in cubic inches to the hundredth ("54000.00").
export interface BoxVolume {
  readonly position: number;
  readonly sign: BoxSign;
  readonly cubicInches: string;
}

// Measurements no capacity can be worked out from, and why. Whether a certification is then saved
// is its service's to say (task 1.2.3); the math only never guesses.
export interface CapacityRefusal {
  readonly code:
    | 'NO_PRIMARY_BOX'
    | 'PRIMARY_BOX_INVALID'
    | 'RADIUS_CORNER_ADDED'
    | 'MEASUREMENT_INVALID'
    | 'NOTHING_HELD'
    | 'CREW_MEASURED';
  readonly message: string;
  // The box it is about, or null where it is about the container as a whole.
  readonly position: number | null;
}

export interface CapacityReading {
  // Whole cubic yards; null for a crew, and where the measurements are refused.
  readonly capacityCy: number | null;
  // The sheet's own lines, each to the hundredth: every box in order, the total, the cubic yards.
  readonly boxes: readonly BoxVolume[];
  readonly totalCubicInches: string | null;
  readonly cubicYards: string | null;
  readonly refusal: CapacityRefusal | null;
}

// 36³: the cubic inches in a cubic yard.
const cubicInchesPerCubicYard = 46_656n;

// A number held as a whole count of hundredths. Only numbers of nought or more are ever multiplied
// or divided here, so "a half up" is simply the next hundredth.
class Hundredths {
  // π, as a hand-calculated sheet has it.
  static readonly pi = new Hundredths(314n);

  private readonly count: bigint;

  private constructor(count: bigint) {
    this.count = count;
  }

  static whole(inches: number): Hundredths {
    return new Hundredths(BigInt(inches) * 100n);
  }

  static nought(): Hundredths {
    return new Hundredths(0n);
  }

  plus(other: Hundredths): Hundredths {
    return new Hundredths(this.count + other.count);
  }

  minus(other: Hundredths): Hundredths {
    return new Hundredths(this.count - other.count);
  }

  times(other: Hundredths): Hundredths {
    return new Hundredths((this.count * other.count + 50n) / 100n);
  }

  dividedBy(whole: bigint): Hundredths {
    return new Hundredths((2n * this.count + whole) / (2n * whole));
  }

  isAboveNought(): boolean {
    return this.count > 0n;
  }

  // To the nearest whole, .5 up.
  toWhole(): number {
    return Number((this.count + 50n) / 100n);
  }

  toString(): string {
    const sign = this.count < 0n ? '-' : '';
    const size = this.count < 0n ? -this.count : this.count;
    return `${sign}${String(size / 100n)}.${String(size % 100n).padStart(2, '0')}`;
  }
}

const shapeNames: Record<BoxShape, string> = {
  RECTANGLE: 'rectangle',
  TRIANGLE: 'triangle',
  TWO_LENGTH_HOIST: 'two-length hoist',
  ROUND_BOTTOM: 'round bottom',
  RADIUS_CORNER: 'radius corner',
};

// One of a box's measurements.
export type Measurement = Exclude<keyof MeasuredBox, 'position' | 'shape' | 'sign'>;

const measurementNames: Record<Measurement, string> = {
  length: 'length',
  secondLength: 'second length',
  width: 'width',
  height: 'height',
  diameter: 'diameter',
  radius: 'radius',
  run: 'run',
  corners: 'number of corners',
};

const measurementsOf: Record<BoxShape, readonly Measurement[]> = {
  RECTANGLE: ['length', 'width', 'height'],
  TRIANGLE: ['length', 'width', 'height'],
  TWO_LENGTH_HOIST: ['length', 'secondLength', 'width', 'height'],
  ROUND_BOTTOM: ['diameter', 'length'],
  RADIUS_CORNER: ['radius', 'run', 'corners'],
};

export class Capacity {
  private readonly kind: CertificationKind;
  private readonly boxes: readonly MeasuredBox[];

  constructor(kind: CertificationKind, boxes: readonly MeasuredBox[]) {
    this.kind = kind;
    this.boxes = [...boxes].sort((a, b) => a.position - b.position);
  }

  // The measurements a shape holds, in the sheet's order: what the certifying phone asks for, every
  // other sent as null (C129; ADR-585).
  static measurementsOf(shape: BoxShape): readonly Measurement[] {
    return measurementsOf[shape];
  }

  // The capacity and the lines it came from, or why there is none.
  work(): CapacityReading {
    if (this.kind === 'CREW') {
      if (this.boxes.length === 0) return Capacity.none(null);
      return Capacity.none({
        code: 'CREW_MEASURED',
        message: 'A crew is not measured: it has no boxes and no capacity.',
        position: null,
      });
    }
    const refusal = this.refusal();
    if (refusal !== null) return Capacity.none(refusal);

    const volumes = this.boxes.map((box) => ({ box, volume: Capacity.volume(box) }));
    let total = Hundredths.nought();
    for (const { box, volume } of volumes) {
      total = box.sign === 'ADD' ? total.plus(volume) : total.minus(volume);
    }
    const boxes = volumes.map(({ box, volume }) => ({
      position: box.position,
      sign: box.sign,
      cubicInches: volume.toString(),
    }));
    if (!total.isAboveNought()) {
      return {
        capacityCy: null,
        boxes,
        totalCubicInches: total.toString(),
        cubicYards: null,
        refusal: {
          code: 'NOTHING_HELD',
          message: `The boxes work out to ${total.toString()} cu in: they subtract as much as the primary box holds, or more. Check the measurements.`,
          position: null,
        },
      };
    }
    const cubicYards = total.dividedBy(cubicInchesPerCubicYard);
    return {
      capacityCy: cubicYards.toWhole(),
      boxes,
      totalCubicInches: total.toString(),
      cubicYards: cubicYards.toString(),
      refusal: null,
    };
  }

  // The first thing that stops the sum, in box order, or null.
  private refusal(): CapacityRefusal | null {
    const primaries = this.boxes.filter((box) => box.position === 0);
    if (primaries.length !== 1) {
      return {
        code: 'NO_PRIMARY_BOX',
        message: 'A container has one primary box, its main interior: length × width × height.',
        position: null,
      };
    }
    for (const box of this.boxes) {
      const name = Capacity.named(box);
      if (box.position === 0 && (box.shape !== 'RECTANGLE' || box.sign !== 'ADD')) {
        return {
          code: 'PRIMARY_BOX_INVALID',
          message:
            'The primary box is a rectangle that adds: length × width × height. Anything else is a box after it.',
          position: 0,
        };
      }
      if (box.shape === 'RADIUS_CORNER' && box.sign === 'ADD') {
        return {
          code: 'RADIUS_CORNER_ADDED',
          message: `${name}: a radius corner is always subtracted.`,
          position: box.position,
        };
      }
      for (const measurement of measurementsOf[box.shape]) {
        const value = box[measurement];
        if (value !== null && Number.isSafeInteger(value) && value >= 1) continue;
        const said = value === null ? 'is missing' : `is ${String(value)}`;
        const unit = measurement === 'corners' ? 'a whole number' : 'a whole number of inches';
        return {
          code: 'MEASUREMENT_INVALID',
          message: `${name}: its ${measurementNames[measurement]} ${said}. Every measurement is ${unit}, 1 or more.`,
          position: box.position,
        };
      }
    }
    return null;
  }

  // One box's cubic inches, each operation rounded to hundredths before the next.
  private static volume(box: MeasuredBox): Hundredths {
    const inches = (measurement: Measurement): Hundredths =>
      Hundredths.whole(box[measurement] ?? 0);
    switch (box.shape) {
      case 'RECTANGLE':
        return inches('length').times(inches('width')).times(inches('height'));
      case 'TRIANGLE':
        return inches('length').times(inches('width')).times(inches('height')).dividedBy(2n);
      case 'TWO_LENGTH_HOIST':
        return inches('length')
          .plus(inches('secondLength'))
          .dividedBy(2n)
          .times(inches('width'))
          .times(inches('height'));
      case 'ROUND_BOTTOM': {
        // A half cylinder: [3.14 × (D ÷ 2)² × L] ÷ 2.
        const half = inches('diameter').dividedBy(2n);
        return half.times(half).times(Hundredths.pi).times(inches('length')).dividedBy(2n);
      }
      case 'RADIUS_CORNER': {
        // The square corner less its quarter circle: (R × R − 3.14 × R × R ÷ 4) × run × corners.
        const square = inches('radius').times(inches('radius'));
        const quarterCircle = Hundredths.pi.times(square).dividedBy(4n);
        return square.minus(quarterCircle).times(inches('run')).times(inches('corners'));
      }
    }
  }

  private static named(box: MeasuredBox): string {
    return box.position === 0
      ? 'The primary box'
      : `Box ${String(box.position)} (${shapeNames[box.shape]})`;
  }

  private static none(refusal: CapacityRefusal | null): CapacityReading {
    return { capacityCy: null, boxes: [], totalCubicInches: null, cubicYards: null, refusal };
  }
}
