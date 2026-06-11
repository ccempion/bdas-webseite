import { Card } from "@bdas/design-system";

export const metadata = { title: "Vorstand" };

// Note: lead-only gating (local_board_lead) arrives with the roles PR (PR 5+).
// Currently the group-scope gate (requireGroupScope) covers this page; any
// board member of the group can access it for now.

export default function Page() {
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-bdas-ink">Vorstand</h1>
      <Card>
        <p className="text-bdas-ink-body">Dieser Bereich wird in einem späteren Schritt gebaut.</p>
      </Card>
    </section>
  );
}
