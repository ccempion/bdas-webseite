import React from "react";

import type { ChoiceOption } from "@bdas/onboarding/client";

const PATHS: Record<ChoiceOption["icon"], string> = {
  studium: "M22 10 12 5 2 10l10 5 10-5z M6 12v5c3 2 9 2 12 0v-5",
  abschluss: "M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12z M8.5 14 7 22l5-3 5 3-1.5-8",
  bdaj:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z " +
    "M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
  herz:
    "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 " +
    "1-1.1a5.5 5.5 0 0 0 0-7.8z",
};

export function Icon({ name }: { name: ChoiceOption["icon"] }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
