/** Deterministic uncompressed ZIP32 for bounded local export bundles. */
export type Bytes = Uint8Array<ArrayBuffer>;
const encoder = new TextEncoder();
const table = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  table[i] = c;
}
function crc32(bytes: Bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = table[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
export function zip(entries: { name: string; bytes: Bytes }[]): Blob {
  if (entries.length < 1 || entries.length > 100)
    throw new Error("Export bundle requires 1–100 entries");
  const parts: BlobPart[] = [],
    central: BlobPart[] = [];
  let offset = 0,
    centralSize = 0;
  for (const entry of entries) {
    if (
      !/^[a-zA-Z0-9_./-]+$/.test(entry.name) ||
      entry.name.startsWith("/") ||
      entry.name.split("/").includes("..")
    )
      throw new Error("Invalid bundle entry name");
    const name = encoder.encode(entry.name),
      data = entry.bytes;
    if (
      data.byteLength > 128 * 1024 * 1024 ||
      offset + data.byteLength > 256 * 1024 * 1024
    )
      throw new Error("Export exceeds bounded ZIP size");
    const crc = crc32(data),
      local = new Uint8Array(30),
      l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true);
    l.setUint16(4, 20, true);
    l.setUint16(6, 0x800, true);
    l.setUint16(12, 33, true);
    l.setUint32(14, crc, true);
    l.setUint32(18, data.length, true);
    l.setUint32(22, data.length, true);
    l.setUint16(26, name.length, true);
    parts.push(local, name, data);
    const dir = new Uint8Array(46),
      d = new DataView(dir.buffer);
    d.setUint32(0, 0x02014b50, true);
    d.setUint16(4, 20, true);
    d.setUint16(6, 20, true);
    d.setUint16(8, 0x800, true);
    d.setUint16(14, 33, true);
    d.setUint32(16, crc, true);
    d.setUint32(20, data.length, true);
    d.setUint32(24, data.length, true);
    d.setUint16(28, name.length, true);
    d.setUint32(42, offset, true);
    central.push(dir, name);
    centralSize += dir.length + name.length;
    offset += local.length + name.length + data.length;
  }
  const end = new Uint8Array(22),
    e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, entries.length, true);
  e.setUint16(10, entries.length, true);
  e.setUint32(12, centralSize, true);
  e.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end], { type: "application/zip" });
}
export function bytes(text: string): Bytes {
  return encoder.encode(text);
}
export async function hash(data: Bytes): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", data))]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
