"use client";

import { usePathname } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";

import { Button, Input } from "@bdas/design-system";

import { HONEYPOT_FIELD } from "./honeypot";
import { subscribePubliclyAction, type PublicSignupState } from "./public-actions";
import { hasSignedUp, markSignedUp } from "./signup-marker";

const initial: PublicSignupState = {};

function SubmitButton({ variant }: { variant: "brand" | "plain" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant === "brand" ? "on-brand" : "primary"} disabled={pending}>
      {pending ? "Wird eingetragen …" : "Ich bin dabei"}
    </Button>
  );
}

/**
 * The public signup field (spec §3.2). One component for every public surface
 * so the four states from §13.2 stay worded identically wherever they appear.
 *
 * `variant="brand"` is the H1 shape from §13.3 — the full brand-red field with
 * a white button, the same tokens PR 2 registered for C1.
 *
 * `hideOnPath` exists because the footer is on every public page, /newsletter
 * included — without it that page would carry the same form twice.
 */
export function NewsletterSignupForm({
  source,
  sourcePath,
  variant = "brand",
  heading = "Bleib in Verbindung",
  hideOnPath,
}: {
  source: string;
  sourcePath: string;
  variant?: "brand" | "plain";
  heading?: string;
  hideOnPath?: string;
}) {
  const [state, action] = useFormState(subscribePubliclyAction, initial);
  const [alreadyDone, setAlreadyDone] = useState(false);
  const pathname = usePathname();
  // Ids must be unique per instance: two of these can share a page (the footer
  // one and a page one), and duplicate ids break every label/aria reference.
  const uid = useId();
  const headingId = `newsletter-heading-${uid}`;
  const emailId = `newsletter-email-${uid}`;

  // Read after mount: localStorage does not exist while rendering on the server,
  // and a mismatch between the two would be a hydration error.
  useEffect(() => {
    setAlreadyDone(hasSignedUp());
  }, []);

  useEffect(() => {
    if (state.ok) markSignedUp();
  }, [state.ok]);

  if (hideOnPath && pathname === hideOnPath) return null;
  if (alreadyDone && !state.ok) return null;

  const onBrand = variant === "brand";

  return (
    <section
      className={
        onBrand
          ? "rounded-bdas bg-bdas-red p-6 text-bdas-ink-on-brand shadow-bdas-card motion-safe:animate-bdas-fade-slide-up"
          : "rounded-bdas border border-bdas-soft bg-bdas-overlay-faint p-6"
      }
      aria-labelledby={headingId}
    >
      <h2
        id={headingId}
        className={onBrand ? "text-lg font-semibold" : "text-lg font-semibold text-bdas-ink"}
      >
        {heading}
      </h2>
      <p
        className={
          onBrand ? "mt-1 max-w-prose text-sm" : "mt-1 max-w-prose text-sm text-bdas-ink-body"
        }
      >
        Ein paar Mal im Jahr schreiben wir dir, was im Verband und in den Hochschulgruppen passiert.
      </p>

      <div aria-live="polite" className="mt-2 text-sm">
        {state.ok
          ? "Fast geschafft. Wir haben dir eine E-Mail geschickt. Bestätige darin einmal, dann bist du dabei."
          : null}
        {state.error ? <span className={onBrand ? "" : "text-bdas-red"}>{state.error}</span> : null}
      </div>

      {!state.ok ? (
        <form action={action} className="mt-4 flex flex-wrap items-end gap-3">
          <input type="hidden" name="source" value={source} />
          <input type="hidden" name="sourcePath" value={sourcePath} />

          {/* Invisible to people, irresistible to naive bots (spec §8 no. 2).
              aria-hidden + tabIndex keep it away from assistive technology; the
              NAME is what both the bot and the action go by.

              Deliberately unlabelled. A <label>Website</label> here would put a
              second field of that name into every page of the site — the footer
              is global — colliding with the real Website field on the group
              form. It bought nothing: a bot that fills every input does not
              read labels, and aria-hidden means no assistive technology ever
              reaches this one. */}
          <div aria-hidden className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
            <input name={HONEYPOT_FIELD} type="text" tabIndex={-1} autoComplete="off" />
          </div>

          <div className="grow" style={{ minWidth: "12rem" }}>
            <label htmlFor={emailId} className="sr-only">
              E-Mail-Adresse
            </label>
            <Input
              id={emailId}
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="deine@mail.de"
            />
          </div>
          <SubmitButton variant={variant} />
        </form>
      ) : null}

      <p className={onBrand ? "mt-3 text-xs opacity-80" : "mt-3 text-xs text-bdas-ink-muted"}>
        Abbestellen kannst du jederzeit. Wie wir mit deinen Daten umgehen, steht im{" "}
        <a href="/datenschutz" className="underline">
          Datenschutzhinweis
        </a>
        .
      </p>
    </section>
  );
}
