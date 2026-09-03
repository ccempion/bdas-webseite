import React from "react";

const SPOTIFY_SHOW_URL = "https://open.spotify.com/embed/show/58ch4A571IGfllcdIvv9Tb?utm_source=generator";

export function PodcastEmbed() {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-semibold text-bdas-ink">BDAS-Podcast</h2>
      <iframe
        title="BDAS-Podcast auf Spotify"
        src={SPOTIFY_SHOW_URL}
        width="100%"
        height={352}
        className="rounded-bdas"
        frameBorder={0}
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        loading="lazy"
        allowFullScreen
      />
    </section>
  );
}
