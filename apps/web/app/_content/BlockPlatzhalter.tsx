import React from "react";

/**
 * Editor-only stand-in for a block that would otherwise render nothing.
 *
 * Never reaches the public page: every caller gates it on `puck.isEditing`,
 * which Puck sets true inside `<Puck>` and false inside `<Render>`. Without
 * it a freshly dropped Button or Bild renders as literally nothing and the
 * board cannot tell the drop worked.
 *
 * Styling mirrors the empty-state idiom already used by the file uploader
 * (`app/_files/FileUploader.tsx`) so the editor speaks one visual language.
 */
export function BlockPlatzhalter({ titel, hinweis }: { titel: string; hinweis: string }) {
  return (
    <div
      data-block-platzhalter
      className="flex flex-col items-center justify-center gap-1 rounded-bdas border border-dashed border-bdas-soft bg-bdas-surface p-8 text-center"
    >
      <p className="text-bdas-ink">{titel}</p>
      <p className="text-sm text-bdas-ink-muted">{hinweis}</p>
    </div>
  );
}
