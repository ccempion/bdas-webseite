import type { ReactNode } from "react";

// Every route under /admin is authenticated and reads the per-request session
// cookie plus live DB state, so it must render at request time. Without this the
// production build tries to statically prerender these pages, constructs the
// core/db client with no DATABASE_URL, and fails (see CI web-build job).
export const dynamic = "force-dynamic";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return children;
}
