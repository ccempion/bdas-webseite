"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";

import { Alert, Button, Card, Form } from "@bdas/design-system";

import { validateStep, resolveUni, WIZARD_STEPS, type WizardValues } from "../_profile/steps";
import { submitWizardAction, type WizardActionState } from "./actions";
import {
  StudiumFields,
  UniGruppeFields,
  GeburtsdatumField,
  GefundenFields,
  FotoStep,
} from "./ProfileFields";

const EMPTY: WizardValues = {
  studiengang: "",
  abschlussart: "",
  uni: "",
  uniOther: "",
  primaryGroupId: "",
  geburtsdatum: "",
  gefundenDurch: "",
  empfehlerName: "",
  vorstellung: "",
  photoStorageKey: null,
};

export function Wizard({
  groups,
}: {
  groups: ReadonlyArray<{ id: string; name: string; city: string }>;
}) {
  const [values, setValues] = useState<WizardValues>(EMPTY);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // On success the action redirects server-side; only failures come back here.
  const [state, action] = useFormState<WizardActionState, FormData>(submitWizardAction, {});

  const set: <K extends keyof WizardValues>(k: K, v: WizardValues[K]) => void = (k, v) =>
    setValues((prev) => ({ ...prev, [k]: v }));

  const current = WIZARD_STEPS[step]!;
  const isReview = current.id === "review";

  function next() {
    const errs = validateStep(current.id, values);
    setErrors(errs);
    if (Object.keys(errs).length === 0) setStep((s) => Math.min(s + 1, WIZARD_STEPS.length - 1));
  }

  return (
    <Card className="flex flex-col gap-6 p-6">
      {/* progress: WIZARD_STEPS, active pill in brand red (tokens) */}
      <ol className="flex flex-wrap gap-2 text-sm">
        {WIZARD_STEPS.map((s, i) => (
          <li
            key={s.id}
            className={
              i === step
                ? "rounded-bdas-sm bg-bdas-red px-2 py-1 text-white"
                : "rounded-bdas-sm px-2 py-1 text-bdas-ink-muted"
            }
          >
            {s.label}
          </li>
        ))}
      </ol>

      {state.error ? <Alert variant="error">{state.error}</Alert> : null}

      {current.id === "studium" && <StudiumFields values={values} set={set} errors={errors} />}
      {current.id === "uni_gruppe" && (
        <UniGruppeFields values={values} set={set} errors={errors} groups={groups} />
      )}
      {current.id === "geburtsdatum" && (
        <GeburtsdatumField values={values} set={set} errors={errors} />
      )}
      {current.id === "gefunden" && <GefundenFields values={values} set={set} errors={errors} />}
      {current.id === "foto" && <FotoStep values={values} set={set} />}
      {isReview && <ReviewSummary values={values} groups={groups} />}

      <div className="flex justify-between">
        <Button variant="secondary" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
          Zurück
        </Button>
        {isReview ? (
          <Form action={action}>
            <input type="hidden" name="studiengang" value={values.studiengang} />
            <input type="hidden" name="abschlussart" value={values.abschlussart} />
            <input type="hidden" name="uni" value={resolveUni(values)} />
            <input type="hidden" name="primaryGroupId" value={values.primaryGroupId} />
            <input type="hidden" name="geburtsdatum" value={values.geburtsdatum} />
            <input type="hidden" name="gefundenDurch" value={values.gefundenDurch} />
            <input type="hidden" name="empfehlerName" value={values.empfehlerName} />
            <input type="hidden" name="vorstellung" value={values.vorstellung} />
            <input type="hidden" name="photoStorageKey" value={values.photoStorageKey ?? ""} />
            <SubmitButton />
          </Form>
        ) : (
          <Button onClick={next}>Weiter</Button>
        )}
      </div>
    </Card>
  );
}

/**
 * The submit is the one action here that reaches the network, and on a cold
 * serverless function it takes seconds. Without a pending state the button
 * looks untouched for that whole time and people submit again — repeatedly,
 * as production showed. Must be a child of the <form> for useFormStatus.
 */
function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Wird gesendet …" : "Absenden"}
    </Button>
  );
}

function ReviewSummary({
  values,
  groups,
}: {
  values: WizardValues;
  groups: ReadonlyArray<{ id: string; name: string }>;
}) {
  const group = groups.find((g) => g.id === values.primaryGroupId)?.name ?? "—";
  return (
    <dl className="grid grid-cols-2 gap-2 text-sm text-bdas-ink-body">
      <dt>Studiengang</dt>
      <dd>{values.studiengang}</dd>
      <dt>Hochschule</dt>
      <dd>{resolveUni(values)}</dd>
      <dt>Gruppe</dt>
      <dd>{group}</dd>
      <dt>Geburtsdatum</dt>
      <dd>{values.geburtsdatum}</dd>
    </dl>
  );
}
