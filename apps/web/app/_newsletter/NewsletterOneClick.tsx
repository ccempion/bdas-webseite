"use client";

import { useFormState, useFormStatus } from "react-dom";

import { Button } from "@bdas/design-system";

import { subscribeMeAction, type NewsletterActionState } from "./actions";

const initial: NewsletterActionState = {};

function JoinButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Wird eingetragen …" : "Ja, ich bin dabei"}
    </Button>
  );
}

/**
 * The signed-in half of an inline surface: we already know the address, so a
 * second confirmation mail would be a detour (spec §3.1). One button, one row.
 *
 * The quiet sibling of `NewsletterPrompt`, which is the same offer in the H1
 * brand-red shape. That shape belongs to /account and the footer; an inline
 * surface sits inside someone else's page and stays out of the way (§13.3).
 *
 * Stays mounted after a successful answer instead of being unmounted by the
 * host: a Server Action re-renders its route, and this answer is exactly what
 * makes the account stop qualifying — a host that dropped it on the new state
 * would swallow the confirmation sentence (§13.2).
 */
export function NewsletterOneClick({
  source,
  sourcePath,
  heading = "Bleib in Verbindung",
}: {
  source: string;
  sourcePath: string;
  heading?: string;
}) {
  const [state, join] = useFormState(subscribeMeAction, initial);

  return (
    <section className="rounded-bdas border border-bdas-soft bg-bdas-overlay-faint p-6">
      <h2 className="text-lg font-semibold text-bdas-ink">{heading}</h2>
      <p className="mt-1 max-w-prose text-sm text-bdas-ink-body">
        Ein paar Mal im Jahr schreiben wir dir, was im Verband und in den Hochschulgruppen passiert.
        Du bist angemeldet, wir kennen deine Adresse — ein Klick genügt.
      </p>

      <div aria-live="polite" className="mt-2 text-sm">
        {state.ok ? "Du bist dabei. Abschalten kannst du das jederzeit unter Mein Konto." : null}
        {state.error ? <span className="text-bdas-red">{state.error}</span> : null}
      </div>

      {!state.ok ? (
        <form action={join} className="mt-4">
          <input type="hidden" name="source" value={source} />
          <input type="hidden" name="sourcePath" value={sourcePath} />
          <JoinButton />
        </form>
      ) : null}

      <p className="mt-3 text-xs text-bdas-ink-muted">
        Abbestellen kannst du jederzeit. Wie wir mit deinen Daten umgehen, steht im{" "}
        <a href="/datenschutz" className="underline">
          Datenschutzhinweis
        </a>
        .
      </p>
    </section>
  );
}
