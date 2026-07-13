import { ImageResponse } from "next/og";

import { OG_LOGO_DATA_URI } from "./_public/og-logo";

export const alt = "BDAS — Bund der Alevitischen Studierenden in Deutschland";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The mark is brand red on transparency, so it needs a light ground to read —
// the red gradient this card used to carry would have swallowed it.
export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        background: "#ffffff",
        borderBottom: "16px solid #d12020",
        color: "#333333",
      }}
    >
      <img src={OG_LOGO_DATA_URI} alt="" width={300} height={291} />
      <div style={{ fontSize: 96, fontWeight: 700 }}>BDAS</div>
      <div style={{ fontSize: 34, color: "#555555" }}>
        Bund der Alevitischen Studierenden in Deutschland
      </div>
    </div>,
    size,
  );
}
