/**
 * @bdas/onboarding — public surface (CLAUDE.md §1 rule 8).
 *
 * Private and deliberately not re-exported: `schema.ts`, `test-db.ts`,
 * `row2journey`.
 */
export {
  FLOW,
  QUESTION_ABSICHT,
  QUESTION_AKTIV_WO,
  QUESTION_GRUPPENWAHL,
  QUESTION_NAME,
  QUESTION_STUDIENORT,
  QUESTION_TYP,
} from "./flow";
export { nextStep, visibleOptions, walk } from "./next-step";
export { validateFlow } from "./validate-flow";
export { isValidAnswer, placeOf, sanitizeAnswers, MAX_CITY, MAX_NAME } from "./answers";
export { fillText, textContext, PLACEHOLDERS, type Placeholder, type TextContext } from "./text";
export {
  DEFAULT_GREETING,
  DIRECT_SOURCE,
  normalizeSource,
  parseEntryContext,
  type EntryContext,
} from "./entry-context";
export { resolveTarget, type ApplicationTarget } from "./target";
export { loadFlowEnv, BDAJ_SLUG, NETZWERK_SLUG } from "./env";
export { getJourneyForUser, saveDetails, startJourney, MAX_JSON_BYTES } from "./services/journeys";
export { completeJourney, type CompleteResult } from "./services/complete";
export { getApplicationIntents } from "./services/intents";
export type { OnboardingCompleted, OnboardingEvent } from "./events";
export {
  OUTCOME_IDS,
  type AnswerValue,
  type Answers,
  type ApplicationIntent,
  type ApplicationTargetKind,
  type ChoiceOption,
  type Condition,
  type Flow,
  type FlowEnv,
  type FlowGroup,
  type Journey,
  type JourneyStatus,
  type NameAnswer,
  type Outcome,
  type OutcomeId,
  type PlaceAnswer,
  type Question,
  type Rule,
  type Step,
  type Target,
  type UserType,
} from "./types";
