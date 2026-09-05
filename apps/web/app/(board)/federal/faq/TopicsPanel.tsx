"use client";

import { useState, useTransition } from "react";

import { Dialog, Input } from "@bdas/design-system";
import type { FaqTopic } from "@bdas/faq";

import {
  createTopicAction,
  deleteTopicAction,
  renameTopicAction,
  reorderTopicsAction,
} from "./actions";

export function TopicsPanel({ topics }: { topics: readonly FaqTopic[] }) {
  const [pending, start] = useTransition();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= topics.length) return;
    const orderedIds = topics.map((t) => t.id);
    [orderedIds[index], orderedIds[target]] = [orderedIds[target]!, orderedIds[index]!];
    start(async () => {
      const res = await reorderTopicsAction(orderedIds);
      if (res.ok) setError(null);
      else setError(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-bdas border border-bdas-soft bg-bdas-surface p-4 shadow-bdas-card">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-bdas-ink">Themen</h3>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="rounded-bdas-sm border border-bdas-soft px-2 py-1 text-xs font-semibold text-bdas-ink-body hover:bg-bdas-overlay-hover"
        >
          + Thema
        </button>
      </div>
      {error && <p className="text-sm text-bdas-red">{error}</p>}
      <ul className="flex flex-col gap-1">
        {topics.map((t, i) => (
          <li key={t.id} className="flex items-center gap-2">
            {renamingId === t.id ? (
              <>
                <Input
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  className="flex-1"
                />
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const res = await renameTopicAction(t.id, renameValue);
                      if (res.ok) {
                        setRenamingId(null);
                        setError(null);
                      } else setError(res.error);
                    })
                  }
                  className="text-sm font-semibold text-bdas-ink-body"
                >
                  Speichern
                </button>
                <button
                  type="button"
                  onClick={() => setRenamingId(null)}
                  className="text-sm text-bdas-ink-muted"
                >
                  Abbrechen
                </button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm text-bdas-ink-body">{t.name}</span>
                <button
                  type="button"
                  disabled={i === 0 || pending}
                  onClick={() => move(i, -1)}
                  className="text-bdas-ink-muted disabled:opacity-30"
                  aria-label={`${t.name} nach oben`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={i === topics.length - 1 || pending}
                  onClick={() => move(i, 1)}
                  className="text-bdas-ink-muted disabled:opacity-30"
                  aria-label={`${t.name} nach unten`}
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRenamingId(t.id);
                    setRenameValue(t.name);
                  }}
                  className="text-xs text-bdas-ink-muted hover:text-bdas-ink"
                >
                  Umbenennen
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (
                      !window.confirm(
                        `„${t.name}" löschen? Zugeordnete Einträge verlieren nur das Thema.`,
                      )
                    )
                      return;
                    start(async () => {
                      const res = await deleteTopicAction(t.id);
                      if (res.ok) setError(null);
                      else setError(res.error);
                    });
                  }}
                  className="text-xs text-bdas-ink-muted hover:text-bdas-red"
                >
                  Löschen
                </button>
              </>
            )}
          </li>
        ))}
        {topics.length === 0 && <li className="text-sm text-bdas-ink-muted">Noch keine Themen.</li>}
      </ul>
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="Thema anlegen">
        <div className="flex flex-col gap-3">
          <Input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Themenname"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending || newName.trim() === ""}
              onClick={() =>
                start(async () => {
                  const res = await createTopicAction(newName);
                  if (res.ok) {
                    setNewName("");
                    setCreateOpen(false);
                    setError(null);
                  } else setError(res.error);
                })
              }
              className="rounded-bdas-sm bg-bdas-red px-3 py-1.5 text-sm font-semibold text-bdas-surface disabled:opacity-40"
            >
              Anlegen
            </button>
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="rounded-bdas-sm border border-bdas-soft px-3 py-1.5 text-sm"
            >
              Abbrechen
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
