import React from "react";

/** Einwilligung und Newsletter-Kästchen — geteilt von `/registrieren` und dem Wizard. */
export function ConsentFields({
  privacyUrl,
  newsletterOn,
  consentError,
}: {
  privacyUrl: string;
  newsletterOn: boolean;
  consentError?: string | undefined;
}) {
  return (
    <>
      <div className="flex flex-col gap-1">
        <label htmlFor="consent" className="flex items-start gap-2 text-sm text-bdas-ink-body">
          <input
            id="consent"
            name="consent"
            type="checkbox"
            value="true"
            required
            aria-describedby={consentError ? "consent-error" : undefined}
            className="mt-0.5 accent-bdas-red"
          />
          <span>
            Ich habe die{" "}
            <a
              href={privacyUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="text-bdas-red hover:underline"
            >
              Datenschutzerklärung
            </a>{" "}
            gelesen und stimme der Verarbeitung meiner Daten zu.
          </span>
        </label>
        {consentError ? (
          <p id="consent-error" role="alert" className="text-sm text-bdas-red">
            {consentError}
          </p>
        ) : null}
      </div>
      {newsletterOn ? (
        <div className="rounded-bdas border border-bdas-soft bg-bdas-overlay-faint p-4">
          <label htmlFor="newsletter" className="flex items-start gap-2 text-sm text-bdas-ink-body">
            {/* Never pre-checked, never coupled to the registration (spec §6). */}
            <input
              id="newsletter"
              name="newsletter"
              type="checkbox"
              value="true"
              className="mt-1 accent-bdas-red"
            />
            <span>
              <span className="font-medium text-bdas-ink">Schreibt mir auch den Newsletter.</span>{" "}
              Ein paar Mal im Jahr, was im Verband ansteht.
            </span>
          </label>
          <p className="mt-2 text-xs text-bdas-ink-muted">
            Abbestellen kannst du jederzeit unter „Mein Konto“. Wie wir mit deinen Daten umgehen,
            steht im{" "}
            <a href={privacyUrl} target="_blank" rel="noreferrer noopener" className="underline">
              Datenschutzhinweis
            </a>
            .
          </p>
        </div>
      ) : null}
    </>
  );
}
