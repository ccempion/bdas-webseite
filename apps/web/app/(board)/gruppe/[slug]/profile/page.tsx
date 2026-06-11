import { Card } from "@bdas/design-system";

export const metadata = { title: "Profil" };

export default function Page() {
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-bdas-ink">Profil</h1>
      <Card>
        <p className="text-bdas-ink-body">Dieser Bereich wird in einem späteren Schritt gebaut.</p>
      </Card>
    </section>
  );
}
