import {
  fillText,
  visibleOptions,
  type AnswerValue,
  type FlowEnv,
  type Question,
  type TextContext,
} from "@bdas/onboarding";

import { AnswerCard } from "./AnswerCard";

export function ChoiceScreen({
  question,
  env,
  ctx,
  value,
  greeting,
  onAnswer,
}: {
  question: Extract<Question, { kind: "choice" }>;
  env: FlowEnv;
  ctx: TextContext;
  value: AnswerValue | undefined;
  greeting?: string | undefined;
  onAnswer: (value: string) => void;
}) {
  return (
    <section>
      <h2 tabIndex={-1} className="text-xl font-semibold text-bdas-ink outline-none">
        {greeting ? `${greeting} ` : ""}
        {fillText(question.title, ctx)}
      </h2>
      <p className="mt-1 text-sm text-bdas-ink-body">{fillText(question.help, ctx)}</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {visibleOptions(question, env).map((o) => (
          <AnswerCard
            key={o.value}
            option={o}
            selected={value === o.value}
            onSelect={() => onAnswer(o.value)}
          />
        ))}
      </div>
    </section>
  );
}
