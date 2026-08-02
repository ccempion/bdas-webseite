/**
 * Typed, static FAQ content model. The FAQ is editorial content no other module
 * reads or writes, so it lives here as data rather than as a DB-backed module
 * (see docs/superpowers/specs/2026-08-02-faq-suite-design.md §3).
 *
 * A body is built from three block kinds only — no raw HTML — so the renderer
 * can style everything with design-system tokens.
 */

export type SectionKey = "allgemein" | "bundesvorstand" | "vorstand" | "mitglieder";

export type FaqBlock =
  | { readonly kind: "p"; readonly text: string }
  | { readonly kind: "steps"; readonly items: readonly string[] }
  | { readonly kind: "link"; readonly href: string; readonly label: string };

export type FaqEntry = {
  readonly id: string;
  readonly question: string;
  readonly body: readonly FaqBlock[];
};

/**
 * A named group of entries inside a section. Only the `vorstand` section uses
 * these — one subgroup per sub-role (LEAD / Vorstand / Event Organisator /
 * Seiten Editor). `roleId` ties the subgroup to the role grant that makes it
 * relevant, so the renderer can highlight the viewer's own sub-role.
 */
export type FaqSubgroup = {
  readonly id: string;
  readonly title: string;
  readonly entries: readonly FaqEntry[];
};

export type FaqSection = {
  readonly key: SectionKey;
  readonly title: string;
  readonly intro?: string;
  /** Entries shown directly under the section (sections without sub-roles). */
  readonly entries: readonly FaqEntry[];
  /** Sub-role groups (only `vorstand`). */
  readonly subgroups?: readonly FaqSubgroup[];
};
