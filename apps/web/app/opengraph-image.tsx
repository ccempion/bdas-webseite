import { ImageResponse } from "next/og";

export const alt = "BDAS — Bund der Alevitischen Studierenden in Deutschland";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

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
        background: "linear-gradient(135deg, #7a1414, #d12020)",
        color: "#ffffff",
      }}
    >
      <div style={{ fontSize: 120, fontWeight: 700 }}>BDAS</div>
      <div style={{ fontSize: 36 }}>Bund der Alevitischen Studierenden in Deutschland</div>
    </div>,
    size,
  );
}
