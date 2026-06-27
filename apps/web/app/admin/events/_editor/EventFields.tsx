"use client";

import { useState } from "react";

import { Field, Input } from "@bdas/design-system";
import type { EventContent } from "@bdas/events-module";

import { LocationPicker } from "./LocationPicker";
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
  startsAtLocal: string;
  endsAtLocal: string;
  registrationDeadlineLocal: string;
  capacity: number | null;
  visibility: string;
  location: { name: string; address: string; lat: number | null; lng: number | null } | null;
  groups: ReadonlyArray<{ id: string; name: string }>;
  allowFederation: boolean;
  groupId: string | null;
  errors?: Record<string, string> | undefined;
};

export function EventFields({ d }: { d: EventDefaults }) {
  const [coverKey, setCoverKey] = useState(d.coverImageKey ?? "");
  const [coverBusy, setCoverBusy] = useState(false);

  async function uploadCover(file: File) {
    setCoverBusy(true);
    try {
      const res = await fetch(`/api/events/${d.eventId}/upload-url`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filename: file.name, mimeType: file.type, sizeBytes: file.size }),
      });
      if (!res.ok) {
        alert((await res.json().catch(() => ({}))).error ?? "Upload fehlgeschlagen.");
        return;
      }
      const { uploadUrl, storageKey } = await res.json();
      const put = await fetch(uploadUrl, { method: "PUT", body: file });
      if (!put.ok) {
        alert("Upload fehlgeschlagen.");
        return;
      }
      setCoverKey(storageKey);
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
          <input
            id="cover"
            type="file"
            accept="image/*"
            disabled={coverBusy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadCover(f);
            }}
          />
          <input type="hidden" name="coverImageKey" value={coverKey} />
          {coverKey ? <p className="mt-1 text-sm text-bdas-ink-muted">Bild gespeichert.</p> : null}
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
          defaultValue={d.visibility}
          className={SELECT_CLASS}
        >
          <option value="public">Öffentlich</option>
          <option value="members_only">Nur Mitglieder</option>
          <option value="group_only">Nur Gruppe</option>
        </select>
      </Field>

      <Field label="Gruppe" htmlFor="groupId" error={d.errors?.["groupId"]}>
        <select
          id="groupId"
          name="groupId"
          defaultValue={d.groupId ?? (d.allowFederation ? "" : (d.groups[0]?.id ?? ""))}
          className={SELECT_CLASS}
        >
          {d.allowFederation ? <option value="">Föderationsweit</option> : null}
          {d.groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </Field>
    </>
  );
}
