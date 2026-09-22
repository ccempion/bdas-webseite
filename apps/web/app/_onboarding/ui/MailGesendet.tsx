"use client";

import React from "react";

import { useFormState } from "react-dom";

import { Button } from "@bdas/design-system";

import { resendAction, type ResendFormState } from "../../verifizierung-erneut-senden/actions";

const initial: ResendFormState = {};

export function MailGesendet({ email, onClose }: { email: string; onClose: () => void }) {
  const [state, action] = useFormState(resendAction, initial);
  return (
    <section className="flex flex-col gap-4">
      <h2 tabIndex={-1} className="text-xl font-semibold text-bdas-ink outline-none">
        Wir haben dir eine Mail geschickt
      </h2>
      <p className="text-bdas-ink-body">
        Klick auf den Link in der Mail an <strong className="text-bdas-ink">{email}</strong>. Danach
        geht es mit ein paar Angaben weiter, auf jedem Gerät. Dieses Fenster kannst du jetzt
        schließen.
      </p>
      <form action={action}>
        <input type="hidden" name="email" value={email} />
        <Button type="submit" variant="secondary">
          Erneut senden
        </Button>
      </form>
      {state.sent ? (
        <p aria-live="polite" className="text-sm text-bdas-ink-body">
          Falls die Adresse bei uns registriert ist, ist ein neuer Link unterwegs.
        </p>
      ) : null}
      <div>
        <Button type="button" variant="ghost" onClick={onClose}>
          Schließen
        </Button>
      </div>
    </section>
  );
}
