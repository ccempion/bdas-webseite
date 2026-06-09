import type { ReactNode } from "react";

// The public group pages read live DB state (listGroups / getGroupBySlug) and
// carry no revalidate hint, so Next tries to statically prerender them at build
// — which constructs core/db with no DATABASE_URL and fails the CI web-build
// job. Rendering at request time keeps the build DB-independent and the group
// listing always fresh. Trade-off: these pages are no longer edge-cached; if the
// "fully cacheable public site" goal (spec §13) is revisited, switch to ISR with
// a DATABASE_URL available at build time instead.
export const dynamic = "force-dynamic";

export default function GruppenLayout({ children }: { children: ReactNode }) {
  return children;
}
