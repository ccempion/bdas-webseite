"use client";

import { useFormState, useFormStatus } from "react-dom";

import { Button } from "@bdas/design-system";

import { subscribeAfterRegistrationAction, type NewsletterActionState } from "./actions";

const initial: NewsletterActionState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" disabled={pending}>
      {pending ? "Wird eingetragen …" : "Ja, gerne"}
    </Button>
  );
}

/**
 * The second, softer attempt (spec §6). Someone has just created an account —
 * the wrong moment to shout, so this is a quiet box and NOT the H1 brand
 * field, which stays reserved for A3 and C1.
 *
 * The address comes from the httpOnly cookie the register action set, never
 * from the request, and the cookie is spent on submit: the offer is made once.
 */
export function NewsletterSecondAttempt() {
  const [state, action] = useFormState(subscribeAfterRegistrationAction, initial);

  return (
    <section className="rounded-bdas border border-bdas-soft bg-bdas-overlay-faint p-4">
      <div aria-live="polite">
        {state.ok ? (
          <p className="text-sm text-bdas-ink-body">
            Du bist dabei. Die E-Mail, die schon unterwegs ist, bestätigt beides auf einmal.
          </p>
        ) : (
          <>
            <p className="text-sm text-bdas-ink-body">
              Willst du auch unseren Newsletter? Ein paar Mal im Jahr, was im Verband ansteht.
              Abbestellen jederzeit unter „Mein Konto“.
            </p>
            {state.error ? <p className="mt-2 text-sm text-bdas-red">{state.error}</p> : null}
            <form action={action} className="mt-3">
              <SubmitButton />
            </form>
          </>
        )}
      </div>
    </section>
  );
}
