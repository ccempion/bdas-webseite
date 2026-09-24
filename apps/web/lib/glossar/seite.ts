import type { Grant } from "@bdas/members";

import { GLOSSAR, type GlossarBereich, type GlossarEintrag } from "./eintraege";

/** Board-only terms are for the federal board and group Leads. */
export function istVorstand(grants: ReadonlyArray<Grant>): boolean {
  return grants.some((g) => g.role === "federal_board" || g.role === "local_board_lead");
}

/** The glossary page's content for this viewer: grouped by area, A–Z within each. */
export function glossarFuer(grants: ReadonlyArray<Grant>): Map<GlossarBereich, GlossarEintrag[]> {
  const vorstand = istVorstand(grants);
  const out = new Map<GlossarBereich, GlossarEintrag[]>();
  for (const e of GLOSSAR) {
    if (e.nurFuer === "vorstand" && !vorstand) continue;
    const list = out.get(e.bereich) ?? [];
    list.push(e);
    out.set(e.bereich, list);
  }
  for (const list of out.values()) list.sort((a, b) => a.begriff.localeCompare(b.begriff, "de"));
  return out;
}
