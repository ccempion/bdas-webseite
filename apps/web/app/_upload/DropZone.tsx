"use client";

import React, { useCallback, useRef, useState, type ReactNode } from "react";

import { dragHasFiles, intakeFiles, type AcceptSpec } from "./accept";

/** Exactly one sink: a surface holds one image, or it holds many. */
type Sink =
  | { onFile: (file: File) => void; onFiles?: never }
  | { onFiles: (files: readonly File[]) => void; onFile?: never };

/**
 * Wraps an existing upload control in a drop target. Drop is an enhancement:
 * the wrapped control keeps its own click and keyboard path, which is also what
 * the Playwright specs drive via `setInputFiles`.
 *
 * Drag state is an enter/leave *counter*, not a boolean — moving the pointer
 * over a child element fires `dragleave` on the parent, and a boolean flickers.
 */
export function DropZone(
  props: {
    accept: AcceptSpec;
    label: string;
    onReject: (messages: readonly string[]) => void;
    disabled?: boolean;
    className?: string;
    children: ReactNode;
  } & Sink,
) {
  // Read the sink off `props` rather than destructuring it: TypeScript does not
  // preserve the union's discrimination through a rest element, so `props.onFile`
  // must stay attached to `props` for the narrowing below to hold.
  const { accept, label, onReject, disabled = false, className = "", children } = props;
  const depth = useRef(0);
  const [over, setOver] = useState(false);

  const reset = useCallback(() => {
    depth.current = 0;
    setOver(false);
  }, []);

  if (disabled) return <div className={className}>{children}</div>;

  return (
    <div
      data-dropzone
      className={`rounded-bdas border border-dashed p-2 transition-colors duration-bdas-quick ease-bdas ${
        over ? "border-bdas-red bg-bdas-overlay-hover" : "border-transparent"
      } ${className}`}
      onDragEnter={(e) => {
        if (!dragHasFiles(Array.from(e.dataTransfer.types))) return;
        depth.current += 1;
        setOver(true);
      }}
      onDragOver={(e) => {
        if (!dragHasFiles(Array.from(e.dataTransfer.types))) return;
        // preventDefault on dragover is what makes an element a valid drop target.
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={() => {
        depth.current -= 1;
        if (depth.current <= 0) reset();
      }}
      onDrop={(e) => {
        if (!dragHasFiles(Array.from(e.dataTransfer.types))) return;
        e.preventDefault();
        // Keep the drop from also reaching the window guard.
        e.stopPropagation();
        reset();
        const { accepted, rejected } = intakeFiles(Array.from(e.dataTransfer.files), accept, {
          firstOnly: props.onFile !== undefined,
        });
        if (rejected.length > 0) onReject(rejected);
        if (accepted.length === 0) return;
        if (props.onFile) props.onFile(accepted[0]!);
        else props.onFiles(accepted);
      }}
    >
      {children}
      {over ? <p className="mt-1 text-sm text-bdas-red">{label}</p> : null}
    </div>
  );
}
