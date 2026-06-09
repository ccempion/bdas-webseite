import type { ReactNode } from "react";

// /account and its children are authenticated and read the per-request session
// cookie plus live DB state, so they must render at request time rather than be
// statically prerendered at build (which constructs core/db with no
// DATABASE_URL and fails the CI web-build job).
export const dynamic = "force-dynamic";

export default function AccountLayout({ children }: { children: ReactNode }) {
  return children;
}
