/**
 * Domain types for the groups module's public surface. The DB row shape
 * (`GroupRow`) is internal — service callers see `Group` / `GroupSummary`.
 */

export type GroupStatus = "active" | "dormant" | "new" | "archived";

/**
 * Die Art einer Gruppe. `hochschulgruppe` ist die Regel und der Vorgabewert;
 * `affiliate` ist eine Partnerorganisation (BDAJ und weitere) — ein Zuhause
 * für Accounts ohne Hochschulgruppen-Scope. Die Art entscheidet zwei Dinge:
 * ob die Gruppe verortet ist (`city`), und ob auf ihr ein lokaler Vorstand
 * sitzen darf (siehe @bdas/members `grantRole`). `netzwerk` ist das Zuhause
 * für Accounts ohne Anspruch auf Mitgliedschaft; `affiliate` bleibt die
 * Partnerorganisation.
 */
export type GroupKind = "hochschulgruppe" | "affiliate" | "netzwerk";

export type GroupLocation = {
  readonly name: string;
  readonly address: string;
  readonly lat: number;
  readonly lng: number;
};

export type Group = {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  /** null nur bei einer nicht verorteten Art (`affiliate`) — bei einer
   *  Hochschulgruppe garantiert der DB-Constraint einen Wert. */
  readonly city: string | null;
  readonly kind: GroupKind;
  readonly contactEmail: string | null;
  readonly instagramUrl: string | null;
  readonly websiteUrl: string | null;
  readonly location: GroupLocation | null;
  /** Storage key of the page banner in the public content-media bucket, or
   *  null. The module stays storage-agnostic: resolving the key to a URL is
   *  the app layer's job (CLAUDE.md §1 rule 2). */
  readonly imageKey: string | null;
  readonly status: GroupStatus;
};

export type GroupSummary = Pick<
  Group,
  "id" | "slug" | "name" | "city" | "status" | "location" | "kind"
>;

export type JoinPolicy = { readonly required: false };
