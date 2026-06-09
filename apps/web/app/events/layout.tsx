import type { ReactNode } from "react";

// Event pages read the per-request session + live DB (viewer-scoped visibility),
// so they render at request time rather than being statically prerendered.
export const dynamic = "force-dynamic";

export default function EventsLayout({ children }: { children: ReactNode }) {
  return children;
}
