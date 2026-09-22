/**
 * @bdas/onboarding/client — the browser-safe part of the public surface.
 *
 * The wizard walks the flow in the browser for instant feedback (spec §5.1),
 * but `index.ts` also exports the services, whose imports reach `node:crypto`
 * through `@bdas/members`. This entry re-exports only pure flow code: no
 * database, no services, no other module (ADR 0049). Everything here is also
 * exported from `index.ts`; the server keeps importing from there.
 */
export { FLOW, QUESTION_GRUPPENWAHL, QUESTION_NAME } from "./flow";
export { visibleOptions, walk } from "./next-step";
export { MAX_CITY, MAX_NAME, sanitizeAnswers } from "./answers";
export { fillText, textContext, type TextContext } from "./text";
export type { EntryContext } from "./entry-context";
export type {
  AnswerValue,
  Answers,
  ChoiceOption,
  Flow,
  FlowEnv,
  FlowGroup,
  NameAnswer,
  Outcome,
  OutcomeId,
  PlaceAnswer,
  Question,
} from "./types";
