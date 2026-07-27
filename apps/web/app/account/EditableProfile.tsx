"use client";

import { useEffect, useState } from "react";
import { useFormState } from "react-dom";

import { Alert, Button } from "@bdas/design-system";

import { saveProfileAction, type ProfileFormState } from "./actions";
import { EditProfileForm, type EditProfileFormProps } from "./EditProfileForm";
import { saveProfileFieldsAction, type EditProfileState } from "./profile-actions";
import { ProfileForm, type ProfileFormProps } from "./ProfileForm";
import type { SummaryRow } from "./profile-summary";

type FormSlot<P> = Omit<P, "state" | "action">;

export type EditableProfileProps = {
  /** Server-side verdict: everything filled in (see `isProfileComplete`). */
  complete: boolean;
  rows: ReadonlyArray<SummaryRow>;
  profileForm: FormSlot<ProfileFormProps>;
  /** Absent when the profile feature flag is off or there is no member row. */
  extendedForm: FormSlot<EditProfileFormProps> | null;
};

const EMPTY_MEMBERS: ProfileFormState = {};
const EMPTY_FIELDS: EditProfileState = {};

/**
 * A finished profile is a record, not a form. It reads as one until the member
 * asks to change it — which is also what stops "Speichern" from sitting there
 * inviting a click that changes nothing. An unfinished profile is still a form,
 * with no gate in the way of completing it.
 *
 * Both action states live here rather than in the forms. The save that
 * completes a profile flips `complete` on the server, and the revalidated tree
 * lands in the same commit as the action result — a form watching its own state
 * would be unmounted before the effect ever ran, taking the confirmation with
 * it.
 */
export function EditableProfile({
  complete,
  rows,
  profileForm,
  extendedForm,
}: EditableProfileProps) {
  const [membersState, membersAction] = useFormState(saveProfileAction, EMPTY_MEMBERS);
  const [fieldsState, fieldsAction] = useFormState(saveProfileFieldsAction, EMPTY_FIELDS);

  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!membersState.ok) return;
    setEditing(false);
    setNotice(membersState.notice ?? "Profil gespeichert.");
  }, [membersState]);

  useEffect(() => {
    if (!fieldsState.ok) return;
    setEditing(false);
    setNotice(fieldsState.notice ?? "Profil gespeichert.");
  }, [fieldsState]);

  const banner = notice ? <Alert variant="success">{notice}</Alert> : null;

  if (complete && !editing) {
    return (
      <div className="flex flex-col gap-6">
        {banner}

        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[minmax(0,12rem)_1fr]">
          {rows.map((row) => (
            <div key={row.label} className="contents">
              <dt className="text-sm text-bdas-ink-muted">{row.label}</dt>
              <dd className="text-bdas-ink">{row.value}</dd>
            </div>
          ))}
        </dl>

        <div>
          <Button
            onClick={() => {
              setNotice(null);
              setEditing(true);
            }}
          >
            Daten ändern
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {banner}

      <div>
        {complete ? <h3 className="mb-4 text-lg font-semibold text-bdas-ink">Stammdaten</h3> : null}
        <ProfileForm {...profileForm} state={membersState} action={membersAction} />
      </div>

      {extendedForm ? (
        <div className="border-t border-bdas-soft pt-6">
          <h3 className="mb-4 text-lg font-semibold text-bdas-ink">Erweitertes Profil</h3>
          <EditProfileForm {...extendedForm} state={fieldsState} action={fieldsAction} />
        </div>
      ) : null}

      {complete ? (
        <div>
          <Button
            variant="secondary"
            onClick={() => {
              setEditing(false);
              setNotice(null);
            }}
          >
            Abbrechen
          </Button>
        </div>
      ) : null}
    </div>
  );
}
