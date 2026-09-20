import "./style.css";
import { RuntimeClient } from "./worker-client";

const status = document.querySelector<HTMLParagraphElement>("#status")!;
const versions = document.querySelector<HTMLDListElement>("#versions")!;
const retry = document.querySelector<HTMLButtonElement>("#retry")!;
const file = document.querySelector<HTMLInputElement>("#configuration")!;
const validation = document.querySelector<HTMLParagraphElement>("#validation")!;
let client: RuntimeClient | undefined;
let generation = 0;
let validationGeneration = 0;
async function initialize() {
  const current = ++generation;
  client?.close();
  versions.replaceChildren();
  retry.hidden = true;
  file.disabled = true;
  validation.textContent = "";
  status.dataset.state = "loading";
  status.textContent = "Starting the Python worker…";
  const fresh = new RuntimeClient((message) => {
    if (current === generation) status.textContent = message;
  });
  client = fresh;
  try {
    const result = await fresh.request({ type: "init" });
    if (current !== generation || result.type !== "ready") return;
    for (const [name, value] of Object.entries(result.versions)) {
      const term = document.createElement("dt");
      term.textContent = name;
      const definition = document.createElement("dd");
      definition.textContent = value;
      versions.append(term, definition);
    }
    status.textContent = "Shared Python environment ready";
    status.dataset.state = "ready";
    file.disabled = false;
  } catch (error) {
    if (current !== generation) return;
    status.textContent = "Initialization failed: " + String(error);
    status.dataset.state = "error";
    retry.hidden = false;
  }
}
file.addEventListener("change", async () => {
  const selected = file.files?.[0];
  if (!selected || !client) return;
  const current = generation;
  const currentValidation = ++validationGeneration;
  validation.textContent = "Validating input structure…";
  try {
    if (selected.size > 1048576) throw new Error("Configuration exceeds 1 MiB");
    const text = await selected.text();
    if (current !== generation || currentValidation !== validationGeneration)
      return;
    const result = await client.request({ type: "validate", text });
    if (
      current === generation &&
      currentValidation === validationGeneration &&
      result.type === "validated"
    )
      validation.textContent = `Valid ${result.schema} input. No scientific calculation performed.`;
  } catch (error) {
    if (current === generation && currentValidation === validationGeneration)
      validation.textContent =
        "Invalid input: " +
        (error instanceof Error ? error.message : String(error));
  }
});
retry.addEventListener("click", () => void initialize());
window.addEventListener("pagehide", () => client?.close());
void initialize();
