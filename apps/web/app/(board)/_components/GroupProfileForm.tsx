"use client";

import { useState, useTransition } from "react";

import { updateGroupProfileAction } from "./group-profile-actions";

export function GroupProfileForm({
  groupId,
  initial,
  revalidatePath,
}: {
  groupId: string;
  initial: { name: string; city: string };
  revalidatePath: string;
}) {
  const [form, setForm] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex max-w-md flex-col gap-3 rounded-bdas border border-bdas-soft bg-bdas-surface p-4 shadow-bdas-card"
      action={() =>
        start(async () => {
          setMsg(null);
          const res = await updateGroupProfileAction(groupId, form, revalidatePath);
          setMsg(res.ok ? "Gespeichert." : (res.error ?? "Fehler"));
        })
      }
    >
      <label className="flex flex-col gap-1 text-sm text-bdas-ink-muted">
        Name
        <input
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="rounded-bdas-sm border border-bdas-soft px-3 py-2 text-bdas-ink"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-bdas-ink-muted">
        Stadt
        <input
          required
          value={form.city}
          onChange={(e) => setForm({ ...form, city: e.target.value })}
          className="rounded-bdas-sm border border-bdas-soft px-3 py-2 text-bdas-ink"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-bdas-sm bg-bdas-red px-3 py-2 text-sm font-semibold text-bdas-surface disabled:opacity-40"
      >
        Speichern
      </button>
      {msg && <p className="text-sm text-bdas-ink-body">{msg}</p>}
    </form>
  );
}
