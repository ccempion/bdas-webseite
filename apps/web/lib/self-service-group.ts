import type { Db } from "@bdas/db";
import { ValidationError } from "@bdas/errors";
import { getGroupKind, type GroupKind } from "@bdas/groups";

/**
 * Welche Gruppe darf ein Account selbst wählen? Nur eine Hochschulgruppe
 * (Spec 2026-09-16 §5.6). Ein Antrag an eine netzwerk- oder affiliate-Gruppe
 * landet beim Bundesvorstand (ADR 0046); aus dem Profil heraus ist das nicht
 * vorgesehen. Einen Einstiegspunkt für Förderer bringt erst der Triage-Wizard.
 *
 * Die aktuelle Gruppe erneut zu wählen bleibt erlaubt: so speichert ein
 * Förderer sein Profil, ohne die Gruppe anzufassen. Eine unbekannte ID
 * lehnt der Fremdschlüssel ab.
 */
export async function requireSelfServiceGroup(
  db: Db,
  toGroupId: string | null,
  currentGroupId: string | null,
): Promise<void> {
  if (toGroupId === null || toGroupId === currentGroupId) return;
  const kind = await getGroupKind(db, toGroupId);
  if (kind !== null && kind !== "hochschulgruppe") {
    throw new ValidationError("Diese Gruppe kannst du nicht selbst wählen.", {
      fields: { primaryGroupId: "Bitte wähle eine Hochschulgruppe." },
    });
  }
}

/** Die Auswahlliste dazu: Hochschulgruppen, plus die aktuelle Gruppe. */
export function selfServiceGroups<G extends { readonly id: string; readonly kind: GroupKind }>(
  groups: ReadonlyArray<G>,
  currentGroupId: string | null,
): G[] {
  return groups.filter((g) => g.kind === "hochschulgruppe" || g.id === currentGroupId);
}
