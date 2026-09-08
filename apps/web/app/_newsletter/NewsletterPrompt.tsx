"use client";

import { useFormState, useFormStatus } from "react-dom";

import { Button } from "@bdas/design-system";

import { dismissPromptAction, subscribeMeAction, type NewsletterActionState } from "./actions";

const initial: NewsletterActionState = {};

function JoinButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="on-brand" disabled={pending}>
      {pending ? "Wird eingetragen …" : "Ja, ich bin dabei"}
    </Button>
  );
}

/**
 * C1 in the H1 shape (spec §13.3): the surface itself is the accent — full
 * brand red, ink.onBrand text, a white button. It stands out through the
 * colour change alone on an otherwise white page, so the entrance animation
 * is `motion-safe:` only and nothing is lost without it.
 */
export function NewsletterPrompt() {
  const [joined, join] = useFormState(subscribeMeAction, initial);
  const [, dismiss] = useFormState(dismissPromptAction, initial);

  return (
    <section
      className="rounded-bdas bg-bdas-red p-6 text-bdas-ink-on-brand shadow-bdas-card
        transition-shadow duration-bdas-soft ease-bdas
        motion-safe:animate-bdas-fade-slide-up"
      aria-labelledby="newsletter-prompt-title"
    >
      <h2 id="newsletter-prompt-title" className="text-lg font-semibold">
        Bleib auf dem Laufenden
      </h2>
      <p className="mt-1 max-w-prose text-sm">
        Ein paar Mal im Jahr schreiben wir dir, was im Verband ansteht. Du bist angemeldet, wir
        kennen deine Adresse — ein Klick genügt.
      </p>

      <div aria-live="polite" className="mt-2 text-sm">
        {joined.ok ? "Du bist dabei. Abschalten kannst du das jederzeit unter Mein Konto." : null}
        {joined.error ?? null}
      </div>

      {!joined.ok ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <form action={join}>
            <input type="hidden" name="source" value="dashboard_hinweis" />
            <input type="hidden" name="sourcePath" value="/account" />
            <JoinButton />
          </form>
          <form action={dismiss}>
            <button
              type="submit"
              className="text-sm underline underline-offset-2 hover:opacity-80
                focus:outline-none focus-visible:ring-2 focus-visible:ring-bdas-ink-on-brand/60"
            >
              Später
            </button>
          </form>
        </div>
      ) : null}
    </section>
  );
}
