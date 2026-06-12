"use client";

import { useState, useTransition } from "react";

import { createGroupAction } from "./group-actions";

export function CreateGroupForm() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", city: "", slug: "" });
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start rounded-bdas-sm bg-bdas-red px-3 py-2 text-sm font-semibold text-bdas-surface"
      >
        + Gruppe anlegen
      </button>
    );
  }
  return (
    <form
      className="flex flex-wrap items-end gap-2 rounded-bdas border border-bdas-soft bg-bdas-surface p-3 shadow-bdas-card"
      action={() =>
        start(async () => {
          setError(null);
          try {
            await createGroupAction(form);
            setForm({ name: "", city: "", slug: "" });
            setOpen(false);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Fehler");
          }
        })
      }
    >
      {(["name", "city", "slug"] as const).map((k) => (
        <label key={k} className="flex flex-col text-xs text-bdas-ink-muted">
          {k === "name" ? "Name" : k === "city" ? "Stadt" : "Slug"}
          <input
            required
            value={form[k]}
            onChange={(e) => setForm({ ...form, [k]: e.target.value })}
            className="rounded-bdas-sm border border-bdas-soft px-2 py-1 text-bdas-ink"
          />
        </label>
      ))}
      <button
        type="submit"
        disabled={pending}
        className="rounded-bdas-sm bg-bdas-red px-3 py-1.5 text-sm font-semibold text-bdas-surface"
      >
        Anlegen
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="rounded-bdas-sm border border-bdas-soft px-3 py-1.5 text-sm"
      >
        Abbrechen
      </button>
      {error && <span className="w-full text-xs text-bdas-red">{error}</span>}
    </form>
  );
}
