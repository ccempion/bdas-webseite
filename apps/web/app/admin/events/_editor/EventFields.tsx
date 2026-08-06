"use client";

import { useMemo, useState } from "react";

import { Combobox, Field, Input } from "@bdas/design-system";
import type { EventContent } from "@bdas/events-module";

import { LocationPicker } from "../../../_components/LocationPicker";
import { DropZone } from "../../../_upload/DropZone";
import { CONTENT_IMAGE, IMAGE_ACCEPT } from "../../../_upload/accept";
import { uploadImage } from "../../../_upload/upload-image";
import { RichTextEditor } from "./RichTextEditor";

const SELECT_CLASS =
  "block w-full rounded-bdas border border-bdas-soft bg-bdas-surface px-3 py-2.5 " +
  "text-base text-bdas-ink focus:border-bdas-red focus:outline-none focus:ring-2 focus:ring-bdas-red/20";

export type EventDefaults = {
  eventId: string;
  title: string;
  summary: string | null;
  content: EventContent | null;
  coverImageKey: string | null;
  coverImageUrl: string | null;
  startsAtLocal: string;
  endsAtLocal: string;
  registrationDeadlineLocal: string;
  capacity: number | null;
  visibility: string;
  allowGuestRegistration: boolean;
  location: { name: string; address: string; lat: number | null; lng: number | null } | null;
  groups: ReadonlyArray<{ id: string; name: string }>;
  allowFederation: boolean;
  groupId: string | null;
  errors?: Record<string, string> | undefined;
};

export function EventFields({ d }: { d: EventDefaults }) {
  const [coverKey, setCoverKey] = useState(d.coverImageKey ?? "");
  const [coverUrl, setCoverUrl] = useState(d.coverImageUrl);
  const [coverBusy, setCoverBusy] = useState(false);
  // Guest registration is only valid on public events; track visibility so the
  // toggle disables (and unchecks) itself when the event isn't public.
  const [visibility, setVisibility] = useState(d.visibility);
  const [allowGuest, setAllowGuest] = useState(d.allowGuestRegistration);

  /** "Föderationsweit" is the empty group id, so it has to be a pickable entry
   *  rather than the placeholder — and only for those allowed to use it. */
  const groupOptions = useMemo(
    () => [
      ...(d.allowFederation ? [{ value: "", label: "Föderationsweit" }] : []),
      ...d.groups.map((g) => ({ value: g.id, label: g.name })),
    ],
    [d.groups, d.allowFederation],
  );
  const [groupId, setGroupId] = useState(
    d.groupId ?? (d.allowFederation ? "" : (d.groups[0]?.id ?? "")),
  );
  const guestAllowed = visibility === "public";

  async function uploadCover(file: File) {
    setCoverBusy(true);
    try {
      const out = await uploadImage<{ uploadUrl: string; publicUrl: string; storageKey: string }>(
        `/api/events/${d.eventId}/upload-url`,
        file,
      );
      if ("error" in out) {
        alert(out.error);
        return;
      }
      setCoverKey(out.ok.storageKey);
      setCoverUrl(out.ok.publicUrl);
    } finally {
      setCoverBusy(false);
    }
  }

  return (
    <>
      <Field label="Titel" htmlFor="title" error={d.errors?.["title"]}>
        <Input id="title" name="title" defaultValue={d.title} required />
      </Field>

      <Field
        label="Kurzbeschreibung (optional)"
        htmlFor="summary"
        hint="1–2 Sätze für die Übersicht."
      >
        <Input id="summary" name="summary" defaultValue={d.summary ?? ""} maxLength={300} />
      </Field>

      {d.eventId !== "" && (
        <Field label="Titelbild (optional)" htmlFor="cover">
          <DropZone
            accept={CONTENT_IMAGE}
            onFile={(file) => void uploadCover(file)}
            onReject={(messages) => alert(messages[0])}
            label="Titelbild hier ablegen"
            disabled={coverBusy}
          >
            {coverUrl ? (
              <img
                src={coverUrl}
                alt=""
                className="mb-2 max-h-48 w-full rounded-bdas object-cover"
              />
            ) : null}
            <input
              id="cover"
              type="file"
              accept={IMAGE_ACCEPT}
              disabled={coverBusy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadCover(f);
              }}
            />
            <input type="hidden" name="coverImageKey" value={coverKey} />
            {coverBusy ? <p className="mt-1 text-sm text-bdas-ink-muted">Lädt hoch…</p> : null}
          </DropZone>
        </Field>
      )}

      <Field label="Beginn" htmlFor="startsAt" error={d.errors?.["startsAt"]}>
        <Input
          id="startsAt"
          name="startsAt"
          type="datetime-local"
          defaultValue={d.startsAtLocal}
          required
        />
      </Field>
      <Field label="Ende (optional)" htmlFor="endsAt" error={d.errors?.["endsAt"]}>
        <Input id="endsAt" name="endsAt" type="datetime-local" defaultValue={d.endsAtLocal} />
      </Field>
      <Field label="Anmeldeschluss (optional)" htmlFor="registrationDeadline">
        <Input
          id="registrationDeadline"
          name="registrationDeadline"
          type="datetime-local"
          defaultValue={d.registrationDeadlineLocal}
        />
      </Field>

      <LocationPicker defaultValue={d.location} />

      {d.eventId === "" && (
        <p className="text-sm text-bdas-ink-muted">
          Titelbild und Bilder im Text nach dem Anlegen im Bearbeiten-Schritt hinzufügen.
        </p>
      )}

      <Field label="Beschreibung" htmlFor="content.body">
        <RichTextEditor
          name="content.body"
          eventId={d.eventId}
          defaultDoc={d.content?.body ?? null}
        />
      </Field>
      <Field label="Ablauf (optional)" htmlFor="content.agenda">
        <RichTextEditor
          name="content.agenda"
          eventId={d.eventId}
          defaultDoc={d.content?.agenda ?? null}
        />
      </Field>
      <Field label="Anfahrt (optional)" htmlFor="content.directions">
        <RichTextEditor
          name="content.directions"
          eventId={d.eventId}
          defaultDoc={d.content?.directions ?? null}
        />
      </Field>
      <Field label="Mitbringen (optional)" htmlFor="content.bring">
        <RichTextEditor
          name="content.bring"
          eventId={d.eventId}
          defaultDoc={d.content?.bring ?? null}
        />
      </Field>

      <Field
        label="Kapazität (optional)"
        htmlFor="capacity"
        hint="Leer lassen = unbegrenzt."
        error={d.errors?.["capacity"]}
      >
        <Input
          id="capacity"
          name="capacity"
          type="number"
          min={1}
          defaultValue={d.capacity ?? ""}
        />
      </Field>

      <Field label="Sichtbarkeit" htmlFor="visibility" error={d.errors?.["visibility"]}>
        <select
          id="visibility"
          name="visibility"
          value={visibility}
          onChange={(e) => setVisibility(e.target.value)}
          className={SELECT_CLASS}
        >
          <option value="public">Öffentlich</option>
          <option value="members_only">Nur Mitglieder</option>
          <option value="group_only">Nur Gruppe</option>
        </select>
      </Field>

      <Field
        label="Gastanmeldung"
        htmlFor="allowGuestRegistration"
        hint="Nicht-Mitglieder können sich mit Name und E-Mail anmelden. Nur für öffentliche Veranstaltungen."
        error={d.errors?.["allowGuestRegistration"]}
      >
        <label className="flex items-center gap-2 text-sm text-bdas-ink-body">
          <input
            type="checkbox"
            id="allowGuestRegistration"
            name="allowGuestRegistration"
            checked={allowGuest && guestAllowed}
            disabled={!guestAllowed}
            onChange={(e) => setAllowGuest(e.target.checked)}
          />
          Gäste ohne Mitgliedskonto zulassen
        </label>
      </Field>

      <Field label="Gruppe" htmlFor="groupId" error={d.errors?.["groupId"]}>
        <Combobox
          id="groupId"
          name="groupId"
          label="Gruppe"
          placeholder="Föderationsweit"
          options={groupOptions}
          value={groupId}
          onChange={setGroupId}
        />
      </Field>
    </>
  );
}
