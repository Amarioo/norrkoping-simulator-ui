/**
 * Lighting Phase L2d — estimated site lighting on private land (docs/lighting-city-l2d/README.md):
 * surface parking lots, the rail yard at Norrköping C, and the private service roads of industrial,
 * port, retail and commercial land. A category of its own, kept apart from street lighting:
 * - its own generator (siteGenerator.ts, a sister of corridorGenerator.ts), policy `lighting-l2d-v1`,
 *   IDs `estimate:lighting-l2d-v1:way/<OSM way>:s<n>`, dataset, provenance file and runtime asset;
 * - two new fixture types whose photometry is an ESTIMATE (no luminaire data exists for these sites);
 * - in the renderer it is one more rollout (describe().streetLighting.rollouts['lighting-l2d-v1'],
 *   describe().siteLighting) and can be left out with `?lighting=no-l2d` (development / hook builds).
 *
 * The municipal lighting guideline (used by L0 for streets) does not cover private land, so every
 * decision here is this project's rule. OSM almost never says whether a lot or yard is lit (0 of the
 * 609 parking outlines in the snapshot carry lit=*); lit=no always wins, lit=yes is recorded as tag
 * evidence. Positions, spacing, types, heights, colour and output are estimates.
 */
import type { TypeSpec } from './corridorGenerator';
import { L2_ZONES } from './corridorL2';

export const L2D_GENERATOR = {
  script: 'src/lib/lighting/siteGenerator.ts',
  version: 'lighting-l2d-v1',
  /** No random numbers: output depends only on the pinned inputs. */
  seed: null,
} as const;
export const L2D_DATASET = 'osm-lighting-l2d-snapshot';
export const L2D_ROLLOUT = 'lighting-l2d';
/** Category label (describe().siteLighting): site lighting, not street lighting. */
export const L2D_CATEGORY = 'site';
/** The supported map (same clip quadrilateral as L2a/L2bc, EPSG:3006). */
export const L2D_ZONE = {
  id: 'L2',
  name: 'Whole supported map (site lighting, Phase L2d)',
  ring: L2_ZONES.L2.ring,
};

/**
 * New fixture types (ESTIMATES; geometry in fixtures.ts). Values are this project's assumptions,
 * chosen so the modelled illuminance lies in the ranges that outdoor-workplace practice uses for
 * parking areas and rail yards (≈ 5–20 lx); they are not luminaire data and were not checked
 * against a standard's text.
 * - site-pole-10m: 10 m pole with a short arm and a flat LED head, symmetric (radial) spread. Lots
 *   and private site roads. ≈ 24 lx below the head (2 400 cd / 10²), spacing 32 m (≈ 3 × height).
 * - yard-mast-18m: 18 m mast with a crown of floodlights, radial. Rail yard. ≈ 22 lx below,
 *   spacing 60 m.
 */
export const L2D_TYPES: Record<'site-pole-10m' | 'yard-mast-18m', TypeSpec> = {
  'site-pole-10m': {
    heightM: 10,
    armM: 0.5,
    cct: 4000,
    candela: 2400,
    rangeM: 36,
    profile: 1,
    spacingM: 32,
    suppressM: 14,
  },
  'yard-mast-18m': {
    heightM: 18,
    armM: 0,
    cct: 4000,
    candela: 7000,
    rangeM: 55,
    profile: 1,
    spacingM: 60,
    suppressM: 25,
  },
};

/** Placement policy `lighting-l2d-v1` (values are this project's parameters). */
export const L2D_POLICY = {
  version: L2D_GENERATOR.version,
  // Parking lots (amenity=parking outlines).
  /** Lots smaller than this get no fixture of their own (≈ 20 spaces). */
  minLotAreaM2: 500,
  /** Perimeter poles stand this far inside the outline. */
  lotInsetM: 1.5,
  /** Extra inward steps tried when the standard inset conflicts. */
  lotExtraInsetsM: [0, 0.5, 1, 1.5, 2],
  /** Interior grid on lots: on, and grid points keep at least factor × spacing from the outline. */
  lotGrid: true,
  lotGridEdgeFactor: 0.6,
  /** Grid-point shifts tried on a conflict (metres along / across the lot's main axis). */
  gridShiftsM: [
    [0, 0], [2, 0], [-2, 0], [0, 2], [0, -2], [4, 0], [-4, 0], [0, 4], [0, -4],
    [3, 3], [-3, 3], [3, -3], [-3, -3], [6, 0], [-6, 0], [0, 6], [0, -6],
  ] as [number, number][],
  /** parking=* values that are not open-air lots (no fixture), and street-side kinds lit by streets. */
  lotExcludedParking: ['underground', 'multi-storey', 'rooftop', 'carports', 'garage_boxes'],
  lotStreetSide: ['street_side', 'lane', 'on_kerb', 'half_on_kerb', 'layby'],
  // Rail yard.
  /** Tracks (railway=rail) with these service values inside landuse=railway land get yard masts. */
  yardServices: ['yard', 'siding'],
  /** Mast offset from the track centreline (rail clearance 3.0 m + 0.5 m), plus extra steps. */
  yardOffsetM: 3.5,
  yardExtraOffsetsM: [0, 1, 2, 3, 4, 6, 8, 10],
  yardShiftsM: [0, 3, -3, 6, -6, 10, -10, 15, -15],
  // Private site roads.
  /** highway=service ways with these service values (none = untagged) on private site land. */
  roadServices: ['', 'parking_aisle', 'drive-through'],
  /** landuse kinds that make a service road a lit site road. */
  siteLanduse: ['industrial', 'port', 'retail', 'commercial', 'railway'],
  /** A way is on site land when at least this share of its length lies inside it. */
  landShare: 0.5,
  kerbSetbackM: 0.8,
  shiftsM: [0, 1.5, -1.5, 3, -3, 4, -4],
  extraSetbacksM: [0, 0.5, 1, 1.5, 2],
  // Clearances (A1–A3 values).
  buildingClearanceM: 0.6,
  carriagewayClearanceM: 0.4,
  tramClearanceM: 2.2,
  railClearanceM: 3.0,
  maxMapDeviationM: 1,
  // Seams and spacing.
  /** A candidate within this distance of an earlier (street, path, square) fixture is lit by it. */
  streetCoverM: 12,
  /** Same-type L2d estimates keep factor × spacing apart; any two fixtures 3 m. */
  estimateSeparationFactor: 0.55,
  anySeparationM: 3,
} as const;
export type SitePolicy = typeof L2D_POLICY;

/** Acceptance order of the rules (lower first), then canonical ID. */
export const L2D_RULES = ['yard-track-mast', 'lot-perimeter', 'lot-grid', 'site-road-one-side'] as const;
export type SiteRule = (typeof L2D_RULES)[number];
/** Fixture type of each rule. */
export const L2D_RULE_TYPE: Record<SiteRule, keyof typeof L2D_TYPES> = {
  'yard-track-mast': 'yard-mast-18m',
  'lot-perimeter': 'site-pole-10m',
  'lot-grid': 'site-pole-10m',
  'site-road-one-side': 'site-pole-10m',
};
/** Station index offset of interior grid points on a lot (perimeter stations are s0 … s999). */
export const LOT_GRID_STATION_BASE = 1000;
