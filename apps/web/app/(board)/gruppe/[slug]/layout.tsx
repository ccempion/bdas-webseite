import type { ReactNode } from "react";

import { requireGroupScope } from "../../../_dashboard/session";

export const dynamic = "force-dynamic";

export default async function GroupLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { slug: string };
}) {
  await requireGroupScope(params.slug);
  return children;
}
