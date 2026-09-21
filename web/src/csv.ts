/** Serialize actual displayed records; units/conversions are the engine's metadata. */
type RecordValue = Record<string, unknown>;
const quote = (value: unknown) => {
  const s =
    value === null || value === undefined
      ? ""
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  return /[",\r\n]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s;
};
export function csv(rows: RecordValue[]): string {
  if (!rows.length) return "";
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return (
    [
      keys.map(quote).join(","),
      ...rows.map((row) => keys.map((k) => quote(row[k])).join(",")),
    ].join("\r\n") + "\r\n"
  );
}
export function gridRows(grid: RecordValue, metadata: unknown): RecordValue[] {
  const x = grid.x as { coordinates: number[] },
    y = grid.y as { coordinates: number[] };
  const metrics = grid.metrics as Record<string, (number | null)[][]>;
  const status = (grid.status ?? grid.after_status) as string[][];
  const criteria = grid.criteria_result as RecordValue | undefined;
  const rows: RecordValue[] = [];
  for (let yi = 0; yi < y.coordinates.length; yi++)
    for (let xi = 0; xi < x.coordinates.length; xi++) {
      const row: RecordValue = {
        y_index: yi,
        x_index: xi,
        x: x.coordinates[xi],
        y: y.coordinates[yi],
        status: status[yi][xi],
        metadata_json: yi === 0 && xi === 0 ? metadata : "",
      };
      for (const [key, values] of Object.entries(metrics))
        row[key] = values[yi][xi];
      for (const key of [
        "admissibility_margin_ml_dl",
        "before_status",
        "after_status",
        "before_hemodynamic_status",
        "after_hemodynamic_status",
        "hemodynamic_status",
        "oxygen_status",
        "binding_criterion",
        "equality_sa_fraction",
        "equality_sv_fraction",
      ]) {
        const values = grid[key] as unknown[][] | undefined;
        if (values) row[key] = values[yi][xi];
      }
      if (criteria)
        for (const [key, value] of Object.entries(criteria))
          row["criterion_" + key] = Array.isArray(value)
            ? value[yi][xi]
            : value;
      rows.push(row);
    }
  return rows;
}
export function recordRows(
  value: unknown,
  path = "$",
  out: RecordValue[] = [],
): RecordValue[] {
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value);
    if (!entries.length)
      out.push({
        path,
        type: Array.isArray(value) ? "array" : "object",
        value: Array.isArray(value) ? "[]" : "{}",
      });
    for (const [key, item] of entries)
      recordRows(
        item,
        path + "/" + key.replaceAll("~", "~0").replaceAll("/", "~1"),
        out,
      );
  } else
    out.push({ path, type: value === null ? "null" : typeof value, value });
  return out;
}
export function paperRows(data: RecordValue, metadata: unknown): RecordValue[] {
  const rows: RecordValue[] = [];
  for (const [ci, c] of (data.curves as RecordValue[]).entries()) {
    const r = c.r as number[],
      x = c.x as (number | null)[],
      y = c.y as (number | null)[],
      status = c.status as string[];
    for (let i = 0; i < r.length; i++) {
      const row: RecordValue = {
        curve_index: ci,
        parameter_index: i,
        r: r[i],
        x_presentation_value: x[i],
        x_presentation_unit: data.x_unit,
        y_presentation_value: y[i],
        y_presentation_unit: data.y_unit,
        status: status[i],
        metadata_json: ci === 0 && i === 0 ? metadata : "",
      };
      for (const [metric, values] of Object.entries(
        c.metrics as Record<string, (number | null)[]>,
      ))
        row[metric] = values[i];
      if (c.raw_algebraic_metrics)
        for (const [metric, values] of Object.entries(
          c.raw_algebraic_metrics as Record<string, number[]>,
        ))
          row["raw_formal_" + metric] = values[i];
      rows.push(row);
    }
  }
  return rows;
}
