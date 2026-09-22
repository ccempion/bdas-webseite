import type { Outcome } from "@bdas/onboarding";

/** Der Wartesatz. Der Entscheider steht bewusst nicht im Satz: sein Text ist als
 *  Satzanfang geschrieben („Der Bundesvorstand") und sähe eingeschoben falsch aus. */
export function waitingSentence(outcome: Outcome): string {
  return `Wir melden uns per Mail, sobald die Entscheidung da ist, ${outcome.duration}.`;
}
