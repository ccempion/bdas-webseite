"use client";

import { useState, useTransition } from "react";

import { Alert, Dialog, Field, Input } from "@bdas/design-system";

import { submitQuestionAction } from "./actions";

/**
 * Question + optional details, then a confirmation state (Spec §5). PR 5's
 * help panel mounts this same dialog with `context` set to the matched route
 * key, which is how a submission records the page it came from.
 */
export function SubmitQuestionDialog({
  open,
  onClose,
  initialQuestion,
  context,
}: {
  open: boolean;
  onClose: () => void;
  initialQuestion: string;
  context: string | null;
}) {
  const [question, setQuestion] = useState(initialQuestion);
  const [details, setDetails] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function close() {
    setSent(false);
    setError(null);
    setDetails("");
    onClose();
  }

  function submit() {
    start(async () => {
      setError(null);
      const res = await submitQuestionAction({
        question,
        ...(details.trim() ? { details } : {}),
        ...(context ? { context } : {}),
      });
      if (res.ok) setSent(true);
      else setError(res.error);
    });
  }

  return (
    <Dialog open={open} onClose={close} title="Frage einreichen">
      {sent ? (
        <div className="flex flex-col gap-4">
          <p className="text-bdas-ink-body">
            Danke! Deine Frage liegt jetzt beim Bundesvorstand. Sobald sie beantwortet ist,
            erscheint sie hier im FAQ.
          </p>
          <button
            type="button"
            onClick={close}
            className="self-start rounded-bdas-sm bg-bdas-red px-3 py-1.5 text-sm font-semibold text-bdas-surface"
          >
            Schließen
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {error && <Alert variant="error">{error}</Alert>}
          <Field label="Deine Frage" htmlFor="faq-submit-question">
            <Input
              id="faq-submit-question"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Was möchtest du wissen?"
            />
          </Field>
          <Field label="Details (optional)" htmlFor="faq-submit-details">
            <textarea
              id="faq-submit-details"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={4}
              className="rounded-bdas border border-bdas-soft px-3 py-2 text-bdas-ink-body"
            />
          </Field>
          <button
            type="button"
            disabled={pending || question.trim() === ""}
            onClick={submit}
            className="self-start rounded-bdas-sm bg-bdas-red px-3 py-1.5 text-sm font-semibold text-bdas-surface disabled:opacity-40"
          >
            Absenden
          </button>
        </div>
      )}
    </Dialog>
  );
}
