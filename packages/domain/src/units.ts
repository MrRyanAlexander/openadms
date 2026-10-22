// US units on every screen (ARCHITECTURE §14; ADR-172): a length the database keeps in meters (a
// site's circle, for the geodesic distance it is compared with, invariant 14) is read and typed in
// feet, whole, the international foot (exactly 0.3048 m). Said once here, for every app.
const metersPerFoot = 0.3048;

export const UsUnits = {
  // Meters as whole feet, the nearest.
  feetOf(meters: number): number {
    return Math.round(meters / metersPerFoot);
  },

  // Whole feet as whole meters, the nearest: what the database keeps.
  metersOf(feet: number): number {
    return Math.round(feet * metersPerFoot);
  },
} as const;
