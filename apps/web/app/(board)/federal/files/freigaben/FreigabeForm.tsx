"use client";

import { useState, useTransition } from "react";

import { Button } from "@bdas/design-system";

import { grantFolderAccessAction } from "./actions";

export type PersonOption = { memberId: string; label: string };
export type FolderOption = { id: string; path: string };

const FIELD =
  "rounded-bdas-sm border border-bdas-soft bg-bdas-surface px-3 py-2 text-sm text-bdas-ink-body";

/** Opens one folder for one person. An existing grant is updated, not duplicated. */
export function FreigabeForm({
  people,
  folders,
}: {
  people: ReadonlyArray<PersonOption>;
  folders: ReadonlyArray<FolderOption>;
}) {
  const [memberId, setMemberId] = useState("");
  const [folderId, setFolderId] = useState("");
  const [canWrite, setCanWrite] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  if (people.length === 0) {
    return (
      <p className="text-sm text-bdas-ink-muted">
        Noch niemand aus einer Partnerorganisation ist aufgenommen.
      </p>
    );
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setMessage(null);
          const res = await grantFolderAccessAction(folderId, memberId, canWrite);
          if (res.ok) {
            setMessage({ ok: true, text: "Freigegeben." });
            setFolderId("");
            setCanWrite(false);
          } else {
            setMessage({ ok: false, text: res.error });
          }
        });
      }}
    >
      <label className="flex flex-col gap-1 text-sm text-bdas-ink">
        Person
        <select
          required
          value={memberId}
          onChange={(e) => setMemberId(e.target.value)}
          className={FIELD}
        >
          <option value="">Bitte wählen</option>
          {people.map((p) => (
            <option key={p.memberId} value={p.memberId}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm text-bdas-ink">
        Ordner (Unterordner sind eingeschlossen)
        <select
          required
          value={folderId}
          onChange={(e) => setFolderId(e.target.value)}
          className={FIELD}
        >
          <option value="">Bitte wählen</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.path}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm text-bdas-ink-body">
        <input type="checkbox" checked={canWrite} onChange={(e) => setCanWrite(e.target.checked)} />
        Darf Dateien hochladen und eigene Dateien löschen
      </label>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending || memberId === "" || folderId === ""}>
          Freigeben
        </Button>
        {message ? (
          <p
            role={message.ok ? "status" : "alert"}
            className={message.ok ? "text-sm text-bdas-ink-body" : "text-sm text-bdas-red"}
          >
            {message.text}
          </p>
        ) : null}
      </div>
    </form>
  );
}
