import type { Answers } from "./types";

/**
 * Woher jemand kommt (Spec §5.1). `prefill` und `email` füllen nur Felder vor;
 * `nextStep` bekommt den Kontext nie zu sehen.
 */
export type EntryContext = {
  readonly source: string;
  readonly greeting: string;
  readonly email?: string;
  readonly prefill?: Answers;
};

export const DIRECT_SOURCE = "direkt";
export const DEFAULT_GREETING = "Schön, dass du da bist!";

/** Whitelist. Alles andere wird `direkt` — die Quelle landet in der DB und in einem Ereignis. */
const KNOWN_SOURCES: ReadonlyArray<RegExp> = [
  /^event:[A-Za-z0-9_-]{1,64}$/,
  /^newsletter$/,
  /^kampagne:[a-z0-9-]{1,64}$/,
  /^inhalt:[A-Za-z0-9_-]{1,64}$/,
];

export function normalizeSource(raw: unknown): string {
  return typeof raw === "string" && KNOWN_SOURCES.some((p) => p.test(raw)) ? raw : DIRECT_SOURCE;
}

export function parseEntryContext(raw: unknown): EntryContext {
  return { source: normalizeSource(raw), greeting: DEFAULT_GREETING };
}
