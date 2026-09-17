import type { EntryContext, FlowEnv } from "@bdas/onboarding/client";

/** Alles, was der Wizard vom Server bekommt. Serialisierbar (Server → Client). */
export type WizardProps = {
  readonly env: FlowEnv;
  readonly entry: EntryContext;
  /** [Hochschule, Ort] — nur Hochschulen in Städten mit aktiver Gruppe. */
  readonly universities: ReadonlyArray<readonly [string, string]>;
  readonly privacyUrl: string;
  readonly passwordHint: string;
  readonly newsletterOn: boolean;
};
