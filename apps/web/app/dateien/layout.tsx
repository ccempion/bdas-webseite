import type { ReactNode } from "react";

// File pages read the per-request session + live DB (permission-scoped
// visibility), so they render at request time rather than being prerendered.
export const dynamic = "force-dynamic";

export default function DateienLayout({ children }: { children: ReactNode }) {
  return children;
}
