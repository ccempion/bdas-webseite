import { strToU8, zipSync } from "fflate";

export type ZipEntry = { readonly name: string; readonly content: string };

export function buildZip(entries: readonly ZipEntry[]): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  for (const e of entries) files[e.name] = strToU8(e.content);
  return zipSync(files);
}
