import type { Reply, Request, Payload } from "./protocol";

type Pending = {
  request: Request;
  resolve: (reply: Reply) => void;
  reject: (error: Error) => void;
};

/** One active calculation and only the newest queued configuration. */
export class RuntimeClient {
  private worker = new Worker(new URL("./worker.ts", import.meta.url), {
    type: "module",
  });
  private generation = 0;
  private active?: Pending;
  private queued?: Pending;
  private timer?: ReturnType<typeof setTimeout>;
  private closed = false;
  constructor(
    private progress: (message: string) => void,
    private unavailable?: (error: Error) => void,
  ) {
    this.worker.onmessage = ({ data }: MessageEvent<Reply>) => {
      if (data.protocol !== 1 || data.id !== this.active?.request.id) return;
      if (data.type === "progress") {
        if (data.id === this.generation) this.progress(data.message);
        return;
      }
      const active = this.active;
      clearTimeout(this.timer);
      this.active = undefined;
      if (data.id === this.generation) {
        if (data.type === "error") active.reject(new Error(data.message));
        else active.resolve(data);
      }
      if (this.queued) {
        const next = this.queued;
        this.queued = undefined;
        this.start(next);
      }
    };
    this.worker.onerror = (event) =>
      this.fail(new Error(event.message || "Worker failed to load"));
  }
  private start(pending: Pending) {
    this.active = pending;
    // The active deadline survives supersession: a stalled worker cannot hold
    // the newest queued calculation forever. Retry creates a fresh worker.
    this.timer = setTimeout(
      () => this.fail(new Error("Worker timed out; retry initialization")),
      30000,
    );
    this.worker.postMessage(pending.request);
  }
  private fail(error: Error) {
    clearTimeout(this.timer);
    this.active?.reject(error);
    this.queued?.reject(error);
    this.active = this.queued = undefined;
    this.closed = true;
    this.worker.terminate();
    this.unavailable?.(error);
  }
  request(payload: Payload): Promise<Reply> {
    if (this.closed)
      return Promise.reject(new Error("Worker closed; retry initialization"));
    const superseded = new Error("Superseded by a newer request");
    this.active?.reject(superseded);
    this.queued?.reject(superseded);
    const request: Request = { ...payload, protocol: 1, id: ++this.generation };
    return new Promise((resolve, reject) => {
      const pending = { request, resolve, reject };
      if (this.active) this.queued = pending;
      else this.start(pending);
    });
  }
  close() {
    this.unavailable = undefined;
    this.fail(new Error("Worker closed"));
  }
}
