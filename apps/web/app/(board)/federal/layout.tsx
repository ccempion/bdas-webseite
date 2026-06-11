import type { ReactNode } from "react";

import { requireFederalScope } from "../../_dashboard/session";

export const dynamic = "force-dynamic";

export default async function FederalLayout({ children }: { children: ReactNode }) {
  await requireFederalScope();
  return children;
}
