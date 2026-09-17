import type { GroupKind } from "@bdas/groups";

export type DelegateRole = "event_organizer" | "page_editor" | "file_manager" | "blogger";

const LABELS: Record<DelegateRole, { option: string; section: string }> = {
  event_organizer: { option: "Event-Manager", section: "Event-Manager" },
  page_editor: { option: "Seiten-Editor", section: "Seiten-Editoren" },
  file_manager: { option: "Datei-Manager", section: "Datei-Manager" },
  blogger: { option: "Blogger", section: "Blogger" },
};

/**
 * Die Rollen, die auf dieser Gruppe vergeben werden können. Außerhalb einer
 * Hochschulgruppe haben Seiten-Editor und Datei-Manager keinen Gegenstand: es
 * gibt dort weder eine öffentliche Gruppenseite noch Gruppenordner (ADR 0047).
 */
export function delegateRoles(
  kind: GroupKind | null,
): ReadonlyArray<{ role: DelegateRole; option: string; section: string }> {
  const roles: DelegateRole[] =
    kind === "hochschulgruppe"
      ? ["event_organizer", "page_editor", "file_manager", "blogger"]
      : ["event_organizer", "blogger"];
  return roles.map((role) => ({ role, ...LABELS[role] }));
}
