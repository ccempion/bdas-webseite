import type { SVGProps } from "react";

import { mimeCategory } from "./folder-meta";

/**
 * Feather/Lucide-style stroke icons (24px grid, currentColor, 2px round
 * strokes) — the same hand-drawn convention as PasswordInput's Eye icons.
 * No icon package: this project has none, and these are the only two shapes
 * needed (folder, file) plus per-category marks (spec #229).
 */
const STROKE: SVGProps<SVGSVGElement> = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

/** Folder glyph for FolderIndex rows. */
export function FolderGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden className={className} {...STROKE}>
      <path d="M3 7a2 2 0 0 1 2-2h4.17a2 2 0 0 1 1.41.59L12 7h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
    </svg>
  );
}

/** A page with a folded top-right corner — the shared base for every file icon. */
function FileOutline() {
  return (
    <>
      <path d="M13.5 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7.5L13.5 2Z" />
      <path d="M13 2.5V7a1 1 0 0 0 1 1h4.5" />
    </>
  );
}

/** File icon matched to its MIME category: PDF, image, spreadsheet, document, generic (spec #229). */
export function FileTypeIcon({ mimeType, className }: { mimeType: string; className?: string }) {
  const category = mimeCategory(mimeType);
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden className={className} {...STROKE}>
      <FileOutline />
      {category === "pdf" ? (
        <text
          x="7.3"
          y="18.6"
          fontSize="6.4"
          fontWeight="700"
          stroke="none"
          fill="currentColor"
          letterSpacing="-0.3"
        >
          PDF
        </text>
      ) : category === "image" ? (
        <>
          <circle cx="10" cy="12.6" r="1.3" />
          <path d="M8 19l2.5-3 2 2.2 2.5-3.7 3 4.5" />
        </>
      ) : category === "spreadsheet" ? (
        <>
          <line x1="8.5" y1="12.6" x2="15.5" y2="12.6" />
          <line x1="8.5" y1="16" x2="15.5" y2="16" />
          <line x1="8.5" y1="19.4" x2="15.5" y2="19.4" />
          <line x1="12" y1="12.6" x2="12" y2="21" />
        </>
      ) : category === "document" ? (
        <>
          <line x1="9" y1="13.2" x2="15" y2="13.2" />
          <line x1="9" y1="16.6" x2="15" y2="16.6" />
        </>
      ) : null}
    </svg>
  );
}

/** Upload glyph for the file-drop affordance bar. */
export function UploadGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden className={className} {...STROKE}>
      <path d="M12 16V4" />
      <path d="M6.5 9.5 12 4l5.5 5.5" />
      <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
    </svg>
  );
}
