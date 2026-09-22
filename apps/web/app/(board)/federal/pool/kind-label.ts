import type { ApplicationIntent } from "@bdas/onboarding";

/** Die Spalte „Art" auf „Ohne Gruppe" (Spec §5.2). */
export function poolKindLabel(input: {
  status: "pending" | "active";
  intent: ApplicationIntent | null;
}): string {
  if (input.status === "active") return "Mitglied ohne Gruppe";
  if (input.intent?.status === "details_offen") return "Angaben offen";
  if (input.intent?.outcome === "student_gruendung") return "Möchte eine Gruppe gründen";
  if (input.intent?.outcome === "student_ohne_gruppe") return "Bewirbt sich ohne Gruppe";
  if (input.intent?.outcome === "alumnus") return "Bewirbt sich als Alumna oder Alumnus";
  return "Bewerber:in";
}
