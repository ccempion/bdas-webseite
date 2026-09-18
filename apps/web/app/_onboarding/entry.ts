import { getDb } from "@bdas/db";
import { ANON, getEvent } from "@bdas/events-module";
import { isFlagOn } from "@bdas/feature-flags";
import { DEFAULT_GREETING, parseEntryContext, type EntryContext } from "@bdas/onboarding";

import { CAMPAIGNS, type Campaign } from "./campaigns";

export type EntryDeps = {
  readonly eventTitle: (id: string) => Promise<string | null>;
  readonly campaigns: Readonly<Record<string, Campaign>>;
};

async function safely<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.error("[onboarding] entry context lookup failed:", err);
    return fallback;
  }
}

/**
 * Der Einstiegskontext mit passender Begrüßung (Spec §4.1 Punkt 1). Die Quelle
 * prüft `parseEntryContext`; hier kommt nur Text dazu, nie eine Antwort.
 */
export async function resolveEntryContext(from: unknown, deps: EntryDeps): Promise<EntryContext> {
  const base = parseEntryContext(from);
  const colon = base.source.indexOf(":");
  const kind = colon === -1 ? base.source : base.source.slice(0, colon);
  const ref = colon === -1 ? "" : base.source.slice(colon + 1);

  switch (kind) {
    case "event": {
      const title = await safely(() => deps.eventTitle(ref), null);
      return title ? { ...base, greeting: `Du warst bei „${title}“ — willkommen!` } : base;
    }
    case "kampagne": {
      const campaign = Object.hasOwn(deps.campaigns, ref) ? deps.campaigns[ref] : undefined;
      return { ...base, greeting: campaign?.greeting ?? DEFAULT_GREETING };
    }
    case "newsletter":
      return { ...base, greeting: "Schön, dass du über den Newsletter zu uns kommst!" };
    case "inhalt":
      return { ...base, greeting: "Schön, dass du mehr sehen willst!" };
    default:
      return base;
  }
}

/** Nur was ein anonymer Besucher von dem Event sehen darf. */
export function defaultEntryDeps(): EntryDeps {
  return {
    eventTitle: async (id) => {
      if (!isFlagOn("events")) return null;
      const event = await getEvent(getDb(), id, ANON);
      return event?.title ?? null;
    },
    campaigns: CAMPAIGNS,
  };
}
