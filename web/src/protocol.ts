export type Payload =
  | { type: "init" }
  | { type: "validate"; text: string }
  | { type: "compute"; text: string };
export type Request = { protocol: 1; id: number } & Payload;
export type BuildContext = {
  build: {
    code_commit: string;
    wheel: string;
    wheel_sha256: string;
    validation_sha256: string;
    [key: string]: unknown;
  };
  versions: Record<string, string>;
  validation: { gates: { status: string; [key: string]: unknown }[] };
};
export type Reply = { protocol: 1; id: number } & (
  | { type: "progress"; message: string }
  | ({ type: "ready" } & BuildContext)
  | { type: "validated"; schema: string }
  | { type: "computed"; result: unknown; elapsedMs: number }
  | { type: "error"; message: string }
);
