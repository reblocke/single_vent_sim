import type { Reply, Request } from "./protocol";

export class RuntimeClient {
  private worker = new Worker(new URL("./worker.ts", import.meta.url), {
    type: "module",
  });
  private generation = 0;
  private pending?: {
    resolve: (reply: Reply) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  };
  constructor(private progress: (message: string) => void) {
    this.worker.onmessage = ({ data }: MessageEvent<Reply>) => {
      if (data.protocol !== 1 || data.id !== this.generation || !this.pending)
        return;
      if (data.type === "progress") {
        this.progress(data.message);
        return;
      }
      const pending = this.pending;
      clearTimeout(pending.timer);
      this.pending = undefined;
      if (data.type === "error") pending.reject(new Error(data.message));
      else pending.resolve(data);
    };
    this.worker.onerror = (event) =>
      this.fail(new Error(event.message || "Worker failed to load"));
  }
  private fail(error: Error) {
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.reject(error);
      this.pending = undefined;
    }
  }
  request(
    payload: { type: "init" } | { type: "validate"; text: string },
  ): Promise<Reply> {
    this.fail(new Error("Superseded by a newer request"));
    const request: Request = { ...payload, protocol: 1, id: ++this.generation };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => this.fail(new Error("Worker timed out; retry initialization")),
        30000,
      );
      this.pending = { resolve, reject, timer };
      this.worker.postMessage(request);
    });
  }
  close() {
    this.fail(new Error("Worker closed"));
    this.worker.terminate();
  }
}
