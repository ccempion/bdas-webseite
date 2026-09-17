import type { ApplicationIntent } from "@bdas/onboarding";

/** Die Spalte „Art" auf „Ohne Gruppe" (Spec §5.2). */
export function poolKindLabel(input: {
  status: "pending" | "active";
  intent: ApplicationIntent | null;
}): string {
  if (input.status === "active") return "Mitglied ohne Gruppe";
  if (input.intent?.status === "details_offen") return "Angaben offen";
  if (input.intent?.outcome === "alumnus") return "Bewirbt sich als Alumna/Alumnus";
  return "Bewerber:in";
}
