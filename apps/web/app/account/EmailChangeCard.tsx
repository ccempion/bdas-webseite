"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";

import { Alert, Button, Card, Field, Form, Input, PasswordInput } from "@bdas/design-system";

import { requestEmailChangeAction, type EmailChangeState } from "./email-actions";

const EMPTY: EmailChangeState = {};

/**
 * Same rare-act reasoning as ChangePasswordCard (§7): collapsed behind the
 * accordion idiom rather than sitting open next to profile data.
 */
export function EmailChangeCard({ currentEmail }: { currentEmail: string }) {
  const [state, action] = useFormState(requestEmailChangeAction, EMPTY);
  const details = useRef<HTMLDetailsElement>(null);
  const [requested, setRequested] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");

  useEffect(() => {
    if (!state.ok) return;
    setRequested(true);
    // <details> hides the panel instead of unmounting it, so anything left in
    // a field survives the collapse — including a password a reveal toggle
    // would show again in cleartext.
    setNewEmail("");
    setCurrentPassword("");
    if (details.current) details.current.open = false;
  }, [state]);

  return (
    <Card flat className="p-6">
      <h2 className="mb-4 text-lg font-semibold text-bdas-ink">E-Mail-Adresse</h2>
      <p className="mb-4 text-sm text-bdas-ink-body">Aktuelle Login-E-Mail: {currentEmail}</p>

      {requested ? (
        <div className="mb-4">
          <Alert variant="success">
            Bestätigungslink an deine neue Adresse gesendet. Bitte prüfe dein Postfach — die
            Änderung wird erst nach Bestätigung wirksam.
          </Alert>
        </div>
      ) : null}

      <details ref={details} className="bdas-accordion">
        {/* onClick, not onToggle: the success effect closes the panel
            programmatically, and onToggle would fire then too — wiping the
            confirmation at the moment it appears. */}
        <summary onClick={() => setRequested(false)}>E-Mail-Adresse ändern</summary>
        <div>
          <Form action={action}>
            {state.error ? <Alert variant="error">{state.error}</Alert> : null}
            <Field label="Neue E-Mail-Adresse" htmlFor="newEmail">
              <Input
                id="newEmail"
                name="newEmail"
                type="email"
                autoComplete="email"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
            </Field>
            <Field label="Aktuelles Passwort" htmlFor="currentPassword">
              <PasswordInput
                id="currentPassword"
                name="currentPassword"
                autoComplete="current-password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </Field>
            <SubmitButton />
          </Form>
        </div>
      </details>
    </Card>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Wird gesendet…" : "Bestätigungslink senden"}
    </Button>
  );
}
