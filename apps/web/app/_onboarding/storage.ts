import { sanitizeAnswers, type Flow } from "@bdas/onboarding";

import { INITIAL, type Stage, type WizardState } from "./wizard-state";

/** Nur dieser Tab (Spec §5.3 Punkt 1): nichts geht vor der Einwilligung an den Server. */
export const STORAGE_KEY = "bdas:onboarding:v1";

const STAGES: ReadonlyArray<Stage> = ["fragen", "ergebnis", "konto"];

export function loadState(flow: Flow): WizardState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const v = JSON.parse(raw) as Record<string, unknown>;
    return {
      stage: STAGES.includes(v["stage"] as Stage) ? (v["stage"] as Stage) : INITIAL.stage,
      answers: sanitizeAnswers(flow, v["answers"]),
      cursor: typeof v["cursor"] === "string" && v["cursor"] in flow.questions ? v["cursor"] : null,
      email: typeof v["email"] === "string" ? v["email"] : "",
    };
  } catch {
    return null;
  }
}

export function saveState(flow: Flow, state: WizardState): void {
  try {
    if (state.stage === "gesendet") {
      sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, flowVersion: flow.version }));
  } catch {
    // Privates Fenster oder gesperrter Speicher: der Wizard funktioniert trotzdem.
  }
}

export function clearState(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
