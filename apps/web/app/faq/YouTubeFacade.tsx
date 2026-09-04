"use client";

import { useState } from "react";

import { youtubeEmbedUrl } from "../../lib/faq/youtube";

/** Kein Request an Google vor dem Klick (Spec §5). */
export function YouTubeFacade({ youtubeId, title }: { youtubeId: string; title: string }) {
  const [active, setActive] = useState(false);
  if (active) {
    return (
      <div className="relative mb-3 aspect-video w-full overflow-hidden rounded-bdas">
        <iframe
          src={youtubeEmbedUrl(youtubeId)}
          title={title}
          allowFullScreen
          loading="lazy"
          allow="encrypted-media; picture-in-picture"
          className="absolute inset-0 h-full w-full border-0"
        />
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => setActive(true)}
      className="relative mb-3 flex aspect-video w-full items-center justify-center overflow-hidden rounded-bdas border border-bdas-soft bg-bdas-surface transition-colors duration-bdas-quick ease-bdas hover:bg-bdas-overlay-hover"
    >
      <span className="flex h-16 w-16 items-center justify-center rounded-bdas-pill bg-bdas-red text-white">
        <svg viewBox="0 0 24 24" className="ml-1 h-8 w-8 fill-current" aria-hidden>
          <path d="M8 5v14l11-7z" />
        </svg>
      </span>
      <span className="absolute bottom-3 left-0 right-0 px-4 text-center text-sm text-bdas-ink-muted">
        Video-Tutorial laden — dabei gilt die Datenschutzerklärung von YouTube
      </span>
    </button>
  );
}
