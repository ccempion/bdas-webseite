"use client";

import { useRef, useState, type DragEvent } from "react";

/**
 * Turns any element into a drop target for a single image file.
 *
 * `dragenter`/`dragleave` fire for every child element the pointer crosses, so
 * the highlight is driven by a depth counter rather than by the last event
 * seen — otherwise moving from the circle onto the image inside it would clear
 * it. `dragover` must call `preventDefault`, or the browser navigates to the
 * dropped file instead of handing it over.
 */
export function usePhotoDrop({
  onFile,
  disabled = false,
}: {
  onFile: (file: File) => void;
  disabled?: boolean;
}) {
  const depth = useRef(0);
  const [dragging, setDragging] = useState(false);

  const reset = () => {
    depth.current = 0;
    setDragging(false);
  };

  const dropHandlers = {
    onDragEnter: (e: DragEvent) => {
      if (disabled) return;
      e.preventDefault();
      depth.current += 1;
      setDragging(true);
    },
    onDragOver: (e: DragEvent) => {
      if (disabled) return;
      e.preventDefault();
    },
    onDragLeave: (e: DragEvent) => {
      if (disabled) return;
      e.preventDefault();
      depth.current -= 1;
      if (depth.current <= 0) reset();
    },
    onDrop: (e: DragEvent) => {
      if (disabled) return;
      e.preventDefault();
      reset();
      const file = e.dataTransfer?.files?.[0];
      if (file) onFile(file);
    },
  };

  return { dragging, dropHandlers };
}
