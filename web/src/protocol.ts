export type Request = {
  protocol: 1;
  id: number;
} & ({ type: "init" } | { type: "validate"; text: string });
export type Reply = {
  protocol: 1;
  id: number;
} & (
  | { type: "progress"; message: string }
  | { type: "ready"; versions: Record<string, string> }
  | { type: "validated"; schema: string }
  | { type: "error"; message: string }
);
