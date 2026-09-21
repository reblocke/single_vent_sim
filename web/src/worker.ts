import type { BuildContext, Request, Reply } from "./protocol";

type PythonRuntime = {
  loadPackage(name: string): Promise<void>;
  unpackArchive(
    data: ArrayBuffer,
    format: string,
    options: { extractDir: string },
  ): void;
  runPython(code: string): unknown;
  globals: {
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
        const manifest = (await response.json()) as BuildContext["build"];
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
          "import sys\nsys.path.insert(0, '/app')\nimport json\nfrom parallel_o2 import runtime_info\nfrom parallel_o2.inputs import parse_request, InputError\nfrom parallel_o2.commands import dispatch_json",
        );
        const versions = JSON.parse(
          String(python.runPython("json.dumps(runtime_info())")),
        ) as Record<string, string>;
        const validationResponse = await fetch(
          new URL("validation.json", base),
        );
        if (!validationResponse.ok)
          throw new Error("Validation inventory unavailable");
        const validationBytes = await validationResponse.arrayBuffer();
        const validationHash = [
          ...new Uint8Array(
            await crypto.subtle.digest("SHA-256", validationBytes),
          ),
        ]
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        if (validationHash !== manifest.validation_sha256)
          throw new Error("Validation inventory build mismatch");
        const validation = JSON.parse(
          new TextDecoder().decode(validationBytes),
        ) as BuildContext["validation"];
        initialized = true;
        reply({
          protocol: 1,
          id,
          type: "ready",
          versions,
          build: manifest,
          validation,
        });
      } finally {
        loading = false;
      }
    } else if (request.type === "compute") {
      if (!initialized || !python)
        throw new Error("Python runtime is not ready");
      if (
        typeof request.text !== "string" ||
        new TextEncoder().encode(request.text).length > 1048576
      )
        throw new Error("Engine command exceeds 1 MiB");
      const started = performance.now();
      python.globals.set("_command_text", request.text);
      try {
        // A Python str crosses as a JS primitive. No PyProxy is created or retained.
        // User input is data in a global; the executed expression is constant.
        const output = JSON.parse(
          String(python.runPython("dispatch_json(_command_text)")),
        ) as { result?: unknown; error?: string };
        if (output.error) throw new Error(output.error);
        reply({
          protocol: 1,
          id,
          type: "computed",
          result: output.result,
          elapsedMs: performance.now() - started,
        });
      } finally {
        python.globals.delete("_command_text");
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
