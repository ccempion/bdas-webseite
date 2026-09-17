"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { Button } from "@bdas/design-system";
import { FLOW, textContext, type AnswerValue } from "@bdas/onboarding";

import { clearState, loadState, saveState } from "./storage";
import type { WizardProps } from "./types";
import { ChoiceScreen } from "./ui/ChoiceScreen";
import { ErgebnisScreen } from "./ui/ErgebnisScreen";
import { KontoScreen } from "./ui/KontoScreen";
import { MailGesendet } from "./ui/MailGesendet";
import { NameScreen } from "./ui/NameScreen";
import { PlaceScreen } from "./ui/PlaceScreen";
import { Progress } from "./ui/Progress";
import {
  canGoBack,
  currentOutcome,
  currentQuestion,
  INITIAL,
  partOf,
  reduce,
  type WizardAction,
  type WizardState,
} from "./wizard-state";

/**
 * Teil 1 und 2 des Einstiegs (Spec §4.1, §4.2). Rendert im Fenster und auf der
 * vollen Seite gleich. Der Zustand lebt in diesem Tab; der Server sieht erst
 * beim Konto-Formular etwas.
 */
export function OnboardingWizard(props: WizardProps & { onClose: () => void }) {
  const { env, entry, universities, onClose } = props;
  const [state, setState] = useState<WizardState>(INITIAL);
  const [restored, setRestored] = useState(false);
  const frame = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = loadState(FLOW);
    if (saved) setState(saved);
    setRestored(true);
  }, []);

  useEffect(() => {
    if (restored) saveState(FLOW, state);
  }, [restored, state]);

  const dispatch = useCallback(
    (action: WizardAction) => setState((s) => reduce(FLOW, env, s, action)),
    [env],
  );
  const onSent = useCallback((email: string) => dispatch({ type: "sent", email }), [dispatch]);

  const questionId = currentQuestion(FLOW, state, env);
  const outcomeId = currentOutcome(FLOW, state, env);

  // Ein Thema pro Bildschirm: der Fokus springt auf die neue Überschrift, damit
  // Screenreader den Wechsel ansagen (Spec §4.4).
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    frame.current?.querySelector<HTMLElement>("h2")?.focus();
  }, [state.stage, questionId]);

  const ctx = textContext(FLOW, state.answers, env);
  const answer = (question: string) => (value: AnswerValue) =>
    dispatch({ type: "answer", question, value });

  let screen: ReactNode = null;
  if (state.stage === "fragen" && questionId) {
    const q = FLOW.questions[questionId];
    const value = state.answers[questionId];
    if (q?.kind === "choice") {
      screen = (
        <ChoiceScreen
          key={questionId}
          question={q}
          env={env}
          ctx={ctx}
          value={value}
          greeting={questionId === FLOW.start ? entry.greeting : undefined}
          onAnswer={answer(questionId)}
        />
      );
    } else if (q?.kind === "name") {
      screen = (
        <NameScreen
          key={questionId}
          question={q}
          ctx={ctx}
          value={value}
          onAnswer={answer(questionId)}
        />
      );
    } else if (q?.kind === "place") {
      screen = (
        <PlaceScreen
          key={questionId}
          question={q}
          ctx={ctx}
          env={env}
          universities={universities}
          value={value}
          onAnswer={answer(questionId)}
        />
      );
    }
  } else if (state.stage === "ergebnis" && outcomeId) {
    screen = (
      <ErgebnisScreen
        outcome={FLOW.outcomes[outcomeId]}
        ctx={ctx}
        onConfirm={() => dispatch({ type: "to_account" })}
        onChange={() => dispatch({ type: "change_type" })}
      />
    );
  } else if (state.stage === "konto") {
    screen = (
      <KontoScreen
        answers={state.answers}
        entry={entry}
        privacyUrl={props.privacyUrl}
        passwordHint={props.passwordHint}
        newsletterOn={props.newsletterOn}
        onSent={onSent}
      />
    );
  } else if (state.stage === "gesendet") {
    screen = (
      <MailGesendet
        email={state.email}
        onClose={() => {
          clearState();
          onClose();
        }}
      />
    );
  }

  return (
    <div ref={frame}>
      <Progress part={partOf(state.stage)} />
      {canGoBack(FLOW, state, env) ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-3 mb-2"
          onClick={() => dispatch({ type: "back" })}
        >
          ← Zurück
        </Button>
      ) : null}
      {screen}
      {state.stage === "fragen" && questionId === FLOW.start ? (
        <p className="mt-6 text-center text-sm text-bdas-ink-body">
          Du hast schon ein Konto?{" "}
          <Link href="/anmelden" className="text-bdas-red hover:underline">
            Anmelden
          </Link>
        </p>
      ) : null}
    </div>
  );
}
