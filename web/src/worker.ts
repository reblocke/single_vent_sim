import type { Request, Reply } from "./protocol";

type PyProxy = { destroy(): void; (text: string): { schema_version: string } };
type PythonRuntime = {
  loadPackage(name: string): Promise<void>;
  unpackArchive(
    data: ArrayBuffer,
    format: string,
    options: { extractDir: string },
  ): void;
  runPython(code: string): unknown;
  globals: {
    get(name: string): PyProxy;
    set(name: string, value: string): void;
    delete(name: string): void;
  };
};
let python: PythonRuntime | undefined;
let initialized = false;
let loading = false;
const base = new URL(import.meta.env.BASE_URL, self.location.origin);
function reply(value: Reply) {
  self.postMessage(value);
}

self.onmessage = async (event: MessageEvent<Request>) => {
  const request = event.data;
  if (request?.protocol !== 1 || !Number.isSafeInteger(request.id)) return;
  const id = request.id;
  try {
    if (request.type === "init") {
      if (loading) throw new Error("Initialization already in progress");
      loading = true;
      try {
        reply({
          protocol: 1,
          id,
          type: "progress",
          message: "Loading pinned Python runtime…",
        });
        const runtimeURL = new URL("runtime/", base).href;
        const probe = await fetch(runtimeURL + "pyodide.asm.wasm", {
          method: "HEAD",
          signal: AbortSignal.timeout(15000),
        });
        if (!probe.ok)
          throw new Error(`Python runtime unavailable: HTTP ${probe.status}`);
        const { loadPyodide } = await import(
          /* @vite-ignore */ runtimeURL + "pyodide.mjs"
        );
        python = (await loadPyodide({ indexURL: runtimeURL })) as PythonRuntime;
        reply({
          protocol: 1,
          id,
          type: "progress",
          message: "Loading NumPy and the shared package…",
        });
        await python.loadPackage("numpy");
        const response = await fetch(new URL("build-info.json", base));
        if (!response.ok)
          throw new Error(
            `Build manifest unavailable: HTTP ${response.status}`,
          );
        const manifest = (await response.json()) as {
          wheel: string;
          wheel_sha256: string;
        };
        if (!/^[a-zA-Z0-9_.-]+\.whl$/.test(manifest.wheel))
          throw new Error("Invalid wheel filename");
        const wheelResponse = await fetch(
          new URL("model/" + manifest.wheel, base),
        );
        if (!wheelResponse.ok)
          throw new Error(`Package unavailable: HTTP ${wheelResponse.status}`);
        const bytes = await wheelResponse.arrayBuffer();
        const hash = [
          ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
        ]
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        if (hash !== manifest.wheel_sha256)
          throw new Error("Shared package hash mismatch");
        python.unpackArchive(bytes, "zip", { extractDir: "/app" });
        python.runPython(
          "import sys\nsys.path.insert(0, '/app')\nimport json\nfrom parallel_o2 import runtime_info\nfrom parallel_o2.inputs import parse_request, InputError",
        );
        const versions = JSON.parse(
          String(python.runPython("json.dumps(runtime_info())")),
        ) as Record<string, string>;
        initialized = true;
        reply({ protocol: 1, id, type: "ready", versions });
      } finally {
        loading = false;
      }
    } else if (request.type === "validate") {
      if (!initialized || !python)
        throw new Error("Python runtime is not ready");
      if (
        typeof request.text !== "string" ||
        new TextEncoder().encode(request.text).length > 1048576
      )
        throw new Error("Configuration exceeds 1 MiB");
      python.globals.set("_request_text", request.text);
      try {
        const result = JSON.parse(
          String(
            python.runPython(
              "try:\n    _validation = {'schema': parse_request(_request_text)['schema_version']}\nexcept InputError as error:\n    _validation = {'error': str(error)}\njson.dumps(_validation)",
            ),
          ),
        ) as { schema?: string; error?: string };
        if (result.error) throw new Error(result.error);
        if (!result.schema) throw new Error("Missing validation response");
        reply({ protocol: 1, id, type: "validated", schema: result.schema });
      } finally {
        python.globals.delete("_request_text");
      }
    } else {
      throw new Error("Unsupported worker request");
    }
  } catch (error) {
    reply({
      protocol: 1,
      id,
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
