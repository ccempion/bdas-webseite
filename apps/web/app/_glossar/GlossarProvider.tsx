"use client";

import React, { createContext, useContext, type ReactNode } from "react";

const GlossarEnabled = createContext(false);

/**
 * Carries the server-side `glossar` flag to client components: `<Begriff>`
 * sits inside client trees (the onboarding wizard) that cannot read env.
 */
export function GlossarProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  return <GlossarEnabled.Provider value={enabled}>{children}</GlossarEnabled.Provider>;
}

export function useGlossarEnabled(): boolean {
  return useContext(GlossarEnabled);
}
