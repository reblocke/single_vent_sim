export type Payload =
  | { type: "init" }
  | { type: "validate"; text: string }
  | { type: "compute"; text: string };
export type Request = { protocol: 1; id: number } & Payload;
export type Reply = { protocol: 1; id: number } & (
  | { type: "progress"; message: string }
  | { type: "ready"; versions: Record<string, string> }
  | { type: "validated"; schema: string }
  | { type: "computed"; result: unknown; elapsedMs: number }
  | { type: "error"; message: string }
);
