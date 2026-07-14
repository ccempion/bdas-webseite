import Link from "next/link";

import { Card, Section } from "@bdas/design-system";

import { AGS } from "../ags";

export function AgBlock() {
  return (
    <Section
      title="Unsere Arbeit"
      intro="In Arbeitsgruppen organisieren wir uns über Gruppengrenzen hinweg."
      action={
        <Link href="/unsere-arbeit" className="text-bdas-red hover:underline">
          Mehr erfahren →
        </Link>
      }
    >
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {AGS.map((ag) => (
          <li key={ag.slug}>
            <Card className="h-full p-4">
              <h3 className="font-semibold text-bdas-ink">{ag.name}</h3>
              <p className="text-sm text-bdas-ink-body">{ag.teaser}</p>
            </Card>
          </li>
        ))}
      </ul>
    </Section>
  );
}
