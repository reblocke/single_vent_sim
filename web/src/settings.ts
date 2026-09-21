import type { Axis, Criteria, Scenario, Scene } from "./model-types";
import type { ResistanceRequest, ResistanceScene } from "./resistance-scenes";
export type PrescribedSettings = {
  preset: string;
  kind: Scene["kind"] | null;
  base: Scenario;
  x: Axis;
  y: Axis;
  metrics: [string, string];
  selected: { x: number; y: number };
  scales: [number, number][];
  criteria: Criteria;
  contour: string;
  overlays: string[];
  slice_visible: boolean;
  slice_axis: string;
  slice_objectives: boolean;
  mass_kg: number | null;
  bsa_m2: number | null;
  pins: {
    a?: Scenario;
    b?: Scenario;
    criteria_a?: Criteria;
    criteria_b?: Criteria;
  };
};
export type ResistanceSettings = {
  preset: string;
  request: ResistanceRequest;
  x: Axis;
  y: Axis;
  metrics: [string, string];
  selected: { x: number; y: number };
  scales: [number, number][];
  policy: ResistanceScene["policy"];
};
export type ComparisonSettings =
  | { mode: "preset"; preset: string }
  | {
      mode: "pinned";
      a: Scenario;
      b: Scenario;
      criteria_a: Criteria;
      criteria_b: Criteria;
    }
  | {
      mode: "resistance";
      a: Record<string, unknown>;
      b: Record<string, unknown>;
      policy: string;
    };
export type LaboratorySettings = {
  source: string;
  figure: string;
  convention: string;
  raw_audit: boolean;
  inverse: { sa: number; sv: number; spv_true: number; spv_assumed: number };
  local_contours: boolean;
};
export type UIState = { schema_version: "parallel-o2-ui-state-v1" } & (
  | { view: "explore"; provider: "prescribed"; settings: PrescribedSettings }
  | { view: "explore"; provider: "resistance"; settings: ResistanceSettings }
  | { view: "compare"; settings: ComparisonSettings }
  | { view: "laboratory"; settings: LaboratorySettings }
  | { view: "model"; settings: Record<string, never> }
);
