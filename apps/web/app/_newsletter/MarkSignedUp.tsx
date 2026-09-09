"use client";

import { useEffect } from "react";

import { markSignedUp } from "./signup-marker";

/**
 * Records in this browser that whoever is looking at it is on the list.
 *
 * Mounted by the confirmation page on success. Until then the marker was only
 * ever set by the form that did the signing up, so someone who signed up on
 * their phone and confirmed on their laptop kept being offered the newsletter
 * on the laptop. Holding a live confirmation token is proof enough.
 *
 * Renders nothing, and writes after mount: `localStorage` does not exist on
 * the server.
 */
export function MarkSignedUp() {
  useEffect(() => {
    markSignedUp();
  }, []);
  return null;
}
