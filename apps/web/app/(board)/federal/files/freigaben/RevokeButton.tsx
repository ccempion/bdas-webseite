"use client";

import { useState, useTransition } from "react";

import { revokeFolderAccessAction } from "./actions";

export function RevokeButton({
  folderId,
  memberId,
  label,
}: {
  folderId: string;
  memberId: string;
  label: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        aria-label={`Freigabe entziehen: ${label}`}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await revokeFolderAccessAction(folderId, memberId);
            if (!res.ok) setError(res.error);
          })
        }
        className="text-sm text-bdas-red hover:underline disabled:opacity-40"
      >
        Entziehen
      </button>
      {error ? (
        <p role="alert" className="text-xs text-bdas-red">
          {error}
        </p>
      ) : null}
    </div>
  );
}
