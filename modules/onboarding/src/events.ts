import type { OutcomeId } from "./types";

/**
 * Veröffentlicht, sobald eine Journey abgeschickt ist (Spec §5.1). Grundlage
 * für die Auswertung der Einstiegsquellen, die später kommt (Spec §10).
 */
export type OnboardingCompleted = {
  readonly type: "onboarding.completed";
  readonly memberId: string;
  readonly outcome: OutcomeId;
  readonly entrySource: string;
  readonly at: Date;
};

export type OnboardingEvent = OnboardingCompleted;
