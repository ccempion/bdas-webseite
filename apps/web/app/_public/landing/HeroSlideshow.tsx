"use client";

import { useEffect, useRef, useState } from "react";

/** Hero wallpaper photos, served from /public/hero. Add more URLs to bring the
 *  slideshow rotation back. */
const SLIDES: ReadonlyArray<string> = ["/hero/gruppe.webp"];

const INTERVAL_MS = 6000;

export function HeroSlideshow({ children }: { children: React.ReactNode }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reducedMotion = useRef(false);

  useEffect(() => {
    reducedMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useEffect(() => {
    if (SLIDES.length < 2 || paused || reducedMotion.current) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % SLIDES.length), INTERVAL_MS);
    return () => clearInterval(t);
  }, [paused]);

  return (
    <div className="relative min-h-[70vh] overflow-hidden">
      {SLIDES.map((src, i) => (
        <div
          key={src}
          aria-hidden
          className="absolute inset-0 bg-cover bg-center transition-opacity duration-bdas-slow ease-bdas"
          style={{ backgroundImage: `url('${src}')`, opacity: i === index ? 1 : 0 }}
        />
      ))}
      <div className="absolute inset-0 bg-bdas-hero-scrim" />
      <div className="relative z-10 flex min-h-[70vh] items-center">{children}</div>
      {SLIDES.length > 1 ? (
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          aria-label={paused ? "Diashow fortsetzen" : "Diashow pausieren"}
          className="absolute bottom-4 right-4 z-20 rounded-bdas-pill border border-bdas-strong bg-bdas-surface px-3 py-1 text-bdas-pill text-bdas-ink"
        >
          {paused ? "▶" : "⏸"}
        </button>
      ) : null}
    </div>
  );
}
