"use client";

import { useState, useTransition } from "react";

import { withdrawGroupChangeAction } from "./actions";

export function WithdrawChangeButton() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="flex flex-col gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await withdrawGroupChangeAction();
            setError(res.ok ? null : (res.error ?? "Fehler"));
          })
        }
        className="self-start rounded-bdas-sm border border-bdas-soft px-3 py-1 text-sm text-bdas-ink-body transition-colors duration-bdas-quick hover:bg-bdas-surface-hover"
      >
        {pending ? "Wird zurückgezogen…" : "Antrag zurückziehen"}
      </button>
      {error ? <span className="text-sm text-bdas-red">{error}</span> : null}
    </span>
  );
}
