export type Scenario = {
  schema_version: "scenario-v2";
  model_version: string;
  indexing_basis: "per_kg" | "per_m2";
  flow: Record<string, number | string>;
  capacity: Record<string, number | string>;
  spv_fraction: number;
  vo2_target_ml_kg_min?: number;
  vo2_target_ml_min_m2?: number;
  source_context: string;
};
export type Criteria = {
  schema_version: "criteria-v1";
  id: string;
  sa_lower_fraction: number;
  sv_lower_fraction: number;
  comparison: "strict_greater_than";
  origin: "source_reported_abstract" | "user_selected";
  source_id?: string;
};
export type Axis = {
  parameter: string;
  min: number;
  max: number;
  n: number;
  scale: "linear" | "log";
};
export type ConstraintLine = {
  kind: string;
  label: string;
  x: (number | null)[];
  y: (number | null)[];
  plot_x: (number | null)[];
  plot_y: (number | null)[];
};
export type Grid = {
  constraint_overlays?: ConstraintLine[];
  schema_version: string;
  indexing_basis: string;
  x: Axis & { coordinates: number[]; plot_coordinates: number[] };
  y: Axis & { coordinates: number[]; plot_coordinates: number[] };
  metrics: Record<string, (number | null)[][]>;
  status: string[][];
  units: Record<string, string>;
  masked_count: number;
  actual_resolution: number[];
  criteria_result?: {
    status: string[][];
    arterial_margin_percentage_points: (number | null)[][];
    venous_margin_percentage_points: (number | null)[][];
  };
  [key: string]: unknown;
};
export type State = {
  status: string;
  metrics: Record<string, number | null>;
  units: Record<string, string>;
  requested: Scenario;
  criterion_result?: {
    status: string;
    arterial: string;
    venous: string;
    arterial_margin_percentage_points: number | null;
    venous_margin_percentage_points: number | null;
  };
  [key: string]: unknown;
};
export type Compute = (
  operation: string,
  args: Record<string, unknown>,
) => Promise<unknown>;
export type Scene = {
  id: string;
  title: string;
  question: string;
  lesson: string;
  base: Scenario;
  x: Axis;
  y: Axis;
  metrics: [string, string];
  kind?: "hb_boundary" | "hb_gain";
};
