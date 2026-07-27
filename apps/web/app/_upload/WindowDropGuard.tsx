"use client";

import { useEffect } from "react";

/**
 * Swallows file drops that miss a drop zone. Without this the browser treats a
 * stray drop as "navigate to that file" and the current page — including an
 * unsaved event or blog draft — is gone.
 *
 * `dragover` must also be prevented: that is what marks the window as a valid
 * drop target, and only a valid target fires a cancellable `drop`. Real drops
 * are stopped by DropZone before they bubble this far.
 */
export function WindowDropGuard() {
  useEffect(() => {
    const swallow = (e: DragEvent) => {
      if (!e.dataTransfer || !Array.from(e.dataTransfer.types).includes("Files")) return;
      e.preventDefault();
    };
    window.addEventListener("dragover", swallow);
    window.addEventListener("drop", swallow);
    return () => {
      window.removeEventListener("dragover", swallow);
      window.removeEventListener("drop", swallow);
    };
  }, []);

  return null;
}
