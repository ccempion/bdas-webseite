"use client";

import { useState, useTransition } from "react";

import type { GroupLocation } from "@bdas/groups";

import { LocationPicker } from "../../_components/LocationPicker";
import { BannerField } from "./BannerField";
import { updateGroupProfileAction } from "./group-profile-actions";

export type GroupProfileFields = {
  name: string;
  city: string;
  contactEmail: string | null;
  instagramUrl: string | null;
  websiteUrl: string | null;
  location: GroupLocation | null;
  imageKey: string | null;
};

const FIELD_CLASS = "rounded-bdas-sm border border-bdas-soft px-3 py-2 text-bdas-ink";

/** An empty optional field is stored as NULL, not as "". */
const orNull = (v: string): string | null => (v.trim() === "" ? null : v.trim());

export function GroupProfileForm({
  groupId,
  slug,
  initial,
  initialImageUrl,
  revalidatePath,
}: {
  groupId: string;
  slug: string;
  initial: GroupProfileFields;
  initialImageUrl: string | null;
  revalidatePath: string;
}) {
  const [form, setForm] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const set = <K extends keyof GroupProfileFields>(key: K, value: GroupProfileFields[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <form
      className="flex max-w-2xl flex-col gap-3 rounded-bdas border border-bdas-soft bg-bdas-surface p-4 shadow-bdas-card"
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
          onChange={(e) => set("name", e.target.value)}
          className={FIELD_CLASS}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm text-bdas-ink-muted">
        Stadt
        <input
          required
          value={form.city}
          onChange={(e) => set("city", e.target.value)}
          className={FIELD_CLASS}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm text-bdas-ink-muted">
        Kontakt-E-Mail
        <input
          type="email"
          value={form.contactEmail ?? ""}
          onChange={(e) => set("contactEmail", orNull(e.target.value))}
          placeholder="aachen@bdas.de"
          className={FIELD_CLASS}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm text-bdas-ink-muted">
        Instagram
        <input
          type="url"
          value={form.instagramUrl ?? ""}
          onChange={(e) => set("instagramUrl", orNull(e.target.value))}
          placeholder="https://instagram.com/bdas.aachen"
          className={FIELD_CLASS}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm text-bdas-ink-muted">
        Website
        <input
          type="url"
          value={form.websiteUrl ?? ""}
          onChange={(e) => set("websiteUrl", orNull(e.target.value))}
          placeholder="https://bdas-aachen.de"
          className={FIELD_CLASS}
        />
      </label>

      <LocationPicker
        defaultValue={initial.location}
        onChange={(location) => set("location", location)}
      />

      <BannerField
        slug={slug}
        imageUrl={initialImageUrl}
        onChange={(imageKey) => set("imageKey", imageKey)}
      />

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
