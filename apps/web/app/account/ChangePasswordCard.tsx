"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";

import { Alert, Button, Card, Field, Form, PasswordInput } from "@bdas/design-system";

import { changePasswordAction, type ChangePasswordState } from "./password-actions";

const EMPTY: ChangePasswordState = {};

/**
 * Changing a password is a rare act, so it stays collapsed behind the
 * accordion idiom (§7) rather than sitting open on a page that is mostly
 * about profile data.
 */
export function ChangePasswordCard({ passwordHint }: { passwordHint: string }) {
  const [state, action] = useFormState(changePasswordAction, EMPTY);
  const details = useRef<HTMLDetailsElement>(null);
  const [changed, setChanged] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    if (!state.ok) return;
    setChanged(true);
    setNewPassword("");
    setConfirmPassword("");
    if (details.current) details.current.open = false;
  }, [state]);

  // Only once the repeat field has been typed in — nagging about a mismatch
  // against an empty box while someone is still typing the first one is noise.
  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

  return (
    <Card flat className="p-6">
      <h2 className="mb-4 text-lg font-semibold text-bdas-ink">Passwort</h2>

      {changed ? (
        <div className="mb-4">
          <Alert variant="success">Passwort geändert. Andere Geräte wurden abgemeldet.</Alert>
        </div>
      ) : null}

      <details ref={details} className="bdas-accordion">
        {/* onClick, not onToggle: the success effect closes the panel
            programmatically, and onToggle would fire then too — wiping the
            confirmation at the moment it appears. */}
        <summary onClick={() => setChanged(false)}>Passwort ändern</summary>
        <div>
          <Form action={action}>
            {state.error ? <Alert variant="error">{state.error}</Alert> : null}
            <Field label="Aktuelles Passwort" htmlFor="currentPassword">
              <PasswordInput
                id="currentPassword"
                name="currentPassword"
                autoComplete="current-password"
                required
              />
            </Field>
            <Field label="Neues Passwort" htmlFor="newPassword" hint={passwordHint}>
              <PasswordInput
                id="newPassword"
                name="newPassword"
                autoComplete="new-password"
                minLength={10}
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </Field>
            <Field
              label="Neues Passwort wiederholen"
              htmlFor="confirmPassword"
              {...(mismatch ? { error: "Die beiden Passwörter stimmen nicht überein." } : {})}
            >
              <PasswordInput
                id="confirmPassword"
                name="confirmPassword"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </Field>
            <SubmitButton disabled={mismatch} />
          </Form>
        </div>
      </details>
    </Card>
  );
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled}>
      {pending ? "Wird gespeichert…" : "Passwort ändern"}
    </Button>
  );
}
