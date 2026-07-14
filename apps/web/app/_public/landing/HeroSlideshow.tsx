"use client";

import { useEffect, useRef, useState } from "react";

/** Placeholder slides: brand-toned gradients. Replace with photo URLs later. */
const SLIDES: ReadonlyArray<string> = [
  "linear-gradient(135deg, #7a1414, #d12020)",
  "linear-gradient(135deg, #333333, #7a1414)",
  "linear-gradient(135deg, #d12020, #333333)",
];

const INTERVAL_MS = 6000;

export function HeroSlideshow({ children }: { children: React.ReactNode }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reducedMotion = useRef(false);

  useEffect(() => {
    reducedMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useEffect(() => {
    if (paused || reducedMotion.current) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % SLIDES.length), INTERVAL_MS);
    return () => clearInterval(t);
  }, [paused]);

  return (
    <div className="relative min-h-[70vh] overflow-hidden">
      {SLIDES.map((bg, i) => (
        <div
          key={bg}
          aria-hidden
          className="absolute inset-0 transition-opacity duration-bdas-slow ease-bdas"
          style={{ backgroundImage: bg, opacity: i === index ? 1 : 0 }}
        />
      ))}
      <div className="absolute inset-0 bg-bdas-hero-scrim" />
      <div className="relative z-10 flex min-h-[70vh] items-center">{children}</div>
      <button
        type="button"
        onClick={() => setPaused((p) => !p)}
        aria-label={paused ? "Diashow fortsetzen" : "Diashow pausieren"}
        className="absolute bottom-4 right-4 z-20 rounded-bdas-pill border border-bdas-strong bg-bdas-surface px-3 py-1 text-bdas-pill text-bdas-ink"
      >
        {paused ? "▶" : "⏸"}
      </button>
    </div>
  );
}
