"use client";

import React from "react";

import { usePuck } from "@puckeditor/core";

/** Header-bar toggle for Puck's built-in preview mode. "interactive" hides
 *  every editing affordance (selection outlines, drag handles, drop-zone
 *  placeholders) and renders the canvas exactly as the public `<Render>`
 *  would — the board can see the real page without publishing first.
 *  Editing stays disabled in that mode; the button switches back to "edit"
 *  to resume. */
export function PreviewToggle() {
  const { appState, dispatch } = usePuck();
  const isPreview = appState.ui.previewMode === "interactive";

  return (
    <button
      type="button"
      onClick={() =>
        dispatch({ type: "setUi", ui: { previewMode: isPreview ? "edit" : "interactive" } })
      }
      className="inline-flex items-center rounded-bdas-sm border border-bdas-strong px-3 py-1.5 text-sm text-bdas-ink transition-colors duration-bdas-quick ease-bdas hover:bg-bdas-surface-hover"
    >
      {isPreview ? "Bearbeiten" : "Vorschau"}
    </button>
  );
}
