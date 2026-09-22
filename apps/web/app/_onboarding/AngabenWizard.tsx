"use client";

import React, { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";

import { Alert, Button } from "@bdas/design-system";
import type { Nutzertyp } from "@bdas/profile";

import { detailScreens, summaryLines, validateDetailScreen, type DetailValues } from "./details";
import { saveDetailsAction, submitApplicationAction, type SubmitState } from "./details-actions";
import { DetailFields, type DetailSetter } from "./ui/DetailFields";
import { Progress } from "./ui/Progress";

const initialSubmit: SubmitState = {};

/** Teil 3 (Spec §4.3): nur die Felder des eigenen Typs, ein Thema pro Bildschirm. */
export function AngabenWizard({
  userType,
  firstName,
  initial,
  notice,
}: {
  userType: Nutzertyp;
  firstName: string;
  initial: DetailValues;
  notice: string | null;
}) {
  const screens = detailScreens(userType);
  const [index, setIndex] = useState(0);
  const [values, setValues] = useState<DetailValues>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitState, submitAction] = useFormState(submitApplicationAction, initialSubmit);
  const frame = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    frame.current?.querySelector<HTMLElement>("h2")?.focus();
  }, [index]);

  const set: DetailSetter = (key, value) => setValues((v) => ({ ...v, [key]: value }));
  const onSummary = index >= screens.length;
  const screen = screens[index];

  function next() {
    if (!screen) return;
    const found = validateDetailScreen(userType, screen, values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    void saveDetailsAction(values);
    setIndex(index + 1);
  }

  return (
    <div ref={frame} className="flex flex-col gap-4">
      <Progress part={3} />
      {index === 0 ? (
        <p className="text-bdas-ink-body">Willkommen zurück, {firstName}, fast geschafft.</p>
      ) : null}
      {notice ? <Alert variant="info">{notice}</Alert> : null}
      {index > 0 ? (
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-ml-3"
            onClick={() => setIndex(index - 1)}
          >
            ← Zurück
          </Button>
        </div>
      ) : null}

      {screen ? (
        <section className="flex flex-col gap-4">
          <h2 tabIndex={-1} className="text-xl font-semibold text-bdas-ink outline-none">
            {screen.title}
          </h2>
          <p className="-mt-3 text-sm text-bdas-ink-body">{screen.why}</p>
          <DetailFields screen={screen} values={values} set={set} errors={errors} />
          <div>
            <Button type="button" onClick={next}>
              Weiter
            </Button>
          </div>
        </section>
      ) : null}

      {onSummary ? (
        <section className="flex flex-col gap-4">
          <h2 tabIndex={-1} className="text-xl font-semibold text-bdas-ink outline-none">
            Passt alles?
          </h2>
          {submitState.error ? <Alert variant="error">{submitState.error}</Alert> : null}
          <ul className="flex flex-col gap-3">
            {screens.map((s, i) => (
              <li
                key={s.id}
                className="flex items-start justify-between gap-4 rounded-bdas border border-bdas-soft p-4"
              >
                <div>
                  <p className="text-sm font-semibold text-bdas-ink">{s.title}</p>
                  {summaryLines(s, values).map((line) => (
                    <p key={line} className="text-bdas-ink-body">
                      {line}
                    </p>
                  ))}
                </div>
                <Button type="button" variant="secondary" size="sm" onClick={() => setIndex(i)}>
                  Ändern
                </Button>
              </li>
            ))}
          </ul>
          <form action={submitAction}>
            <input type="hidden" name="values" value={JSON.stringify(values)} />
            <SubmitButton />
          </form>
        </section>
      ) : null}
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Wird abgeschickt…" : "Bewerbung abschicken"}
    </Button>
  );
}
