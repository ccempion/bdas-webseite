"use client";

import { useState, useTransition } from "react";

import { grantRoleAction } from "./role-actions";

export type RoleOption = { role: string; label: string; groupId: string | null; needsTypedConfirm?: boolean };
export type Candidate = { memberId: string; name: string };

export function GrantRoleModal({
  title,
  candidates,
  roleOptions,
  revalidatePath,
}: {
  title: string;
  candidates: Candidate[]; // pre-fetched server-side; filtered client-side
  roleOptions: RoleOption[];
  revalidatePath: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Candidate | null>(null);
  const [optIdx, setOptIdx] = useState(0);
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const opt = roleOptions[optIdx];
  const needsConfirm = opt?.needsTypedConfirm === true;
  const confirmOk = !needsConfirm || (picked !== null && confirmText.trim().toUpperCase() === picked.name.toUpperCase());
  const matches = q.trim() === "" ? [] : candidates.filter((c) => c.name.toLowerCase().includes(q.toLowerCase())).slice(0, 8);

  function reset() {
    setOpen(false); setQ(""); setPicked(null); setOptIdx(0); setConfirmText(""); setError(null);
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="self-start rounded-bdas-sm bg-bdas-red px-3 py-2 text-sm font-semibold text-bdas-surface">
        + {title}
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-3 rounded-bdas border border-bdas-soft bg-bdas-surface p-4 shadow-bdas-dropdown">
      <h3 className="text-sm font-bold text-bdas-ink">{title}</h3>
      {!picked && (
        <>
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Mitglied suchen…" className="rounded-bdas-sm border border-bdas-soft px-3 py-2 text-bdas-ink" />
          <ul>
            {matches.map((c) => (
              <li key={c.memberId}>
                <button type="button" onClick={() => setPicked(c)} className="block w-full rounded-bdas-sm px-2 py-1.5 text-left text-sm text-bdas-ink-body hover:bg-bdas-surface-hover">{c.name}</button>
              </li>
            ))}
            {q.trim() !== "" && matches.length === 0 && <li className="px-2 py-1.5 text-sm text-bdas-ink-muted">Keine Treffer.</li>}
          </ul>
        </>
      )}
      {picked && (
        <>
          <p className="text-sm text-bdas-ink">{picked.name}</p>
          <select value={optIdx} onChange={(e) => setOptIdx(Number(e.target.value))} className="rounded-bdas-sm border border-bdas-soft px-2 py-1.5 text-sm text-bdas-ink-body">
            {roleOptions.map((o, i) => <option key={`${o.role}:${o.groupId ?? ""}`} value={i}>{o.label}</option>)}
          </select>
          {needsConfirm && (
            <div className="rounded-bdas border border-bdas-strong p-3 text-sm">
              <p className="mb-2 text-bdas-red">&#9888; Bundesvorstand hat vollen Zugriff auf alle Gruppen. Tippe den Namen zur Bestätigung.</p>
              <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={picked.name.toUpperCase()} className="w-full rounded-bdas-sm border border-bdas-soft px-2 py-1.5" />
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending || !confirmOk || !opt}
              onClick={() =>
                start(async () => {
                  setError(null);
                  if (!opt) return;
                  const res = await grantRoleAction(picked.memberId, opt.role, opt.groupId, revalidatePath);
                  if (res.ok) reset();
                  else setError(res.error ?? "Fehler");
                })
              }
              className="rounded-bdas-sm bg-bdas-red px-3 py-1.5 text-sm font-semibold text-bdas-surface disabled:opacity-40"
            >
              Erteilen
            </button>
            <button type="button" onClick={reset} className="rounded-bdas-sm border border-bdas-soft px-3 py-1.5 text-sm">Abbrechen</button>
          </div>
        </>
      )}
      {error && <p className="text-sm text-bdas-red">{error}</p>}
    </div>
  );
}
