"use client";

import { useRouter } from "next/navigation";

import { Card } from "@bdas/design-system";

import { OnboardingWizard } from "./OnboardingWizard";
import type { WizardProps } from "./types";

/** Dieselbe Komponente als Seite — für geteilte Links, QR-Codes und Neuladen. */
export function WizardPage(props: WizardProps) {
  const router = useRouter();
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-semibold text-bdas-ink">Mitglied werden</h1>
      <Card flat className="p-6">
        <OnboardingWizard {...props} onClose={() => router.push("/")} />
      </Card>
    </main>
  );
}
