"use client";

import { useRouter } from "next/navigation";

import { Dialog } from "@bdas/design-system";

import { OnboardingWizard } from "./OnboardingWizard";
import type { WizardProps } from "./types";

/** Das Fenster über der aktuellen Seite (Spec §5.5). Schließen = zurück zur Seite darunter. */
export function WizardModal(props: WizardProps) {
  const router = useRouter();
  const close = () => router.back();
  return (
    <Dialog open onClose={close} title="Mitglied werden" wide sheet>
      <OnboardingWizard {...props} onClose={close} />
    </Dialog>
  );
}
