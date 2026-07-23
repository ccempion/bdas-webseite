/**
 * BdasLoader — the BDAS brand mark as a loading indicator.
 *
 * A white highlight sweeps along the logo silhouette from the tail (lower-left)
 * to the head (upper-right); as it arrives, the graduation cap bobs and flicks
 * its tassel, then the loop repeats — "momentum toward graduation".
 *
 * Hybrid, library-free: the body is the real PNG; the shine is a gradient masked
 * to the logo silhouette; the moving cap is a cap-clipped copy of the same PNG
 * (identical art — no traced-shape mismatch). Animations come from the
 * design-system preset (`animate-bdas-loader-*`) and honour prefers-reduced-motion.
 */
import Image from "next/image";

import logo from "../public/bdas-logo.png";

const LOGO_URL = "/bdas-logo.png";

const heights = {
  sm: "h-6",
  md: "h-10",
  lg: "h-24",
} as const;

export function BdasLoader({
  size = "md",
  className = "",
}: {
  size?: keyof typeof heights;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-label="Wird geladen"
      className={`relative inline-block ${heights[size]} ${className}`}
    >
      <Image src={logo} alt="" priority className="h-full w-auto" />

      {/* White shine (bg-bdas-loader-shine), clipped to the logo silhouette,
          travelling tail → head. background-size is oversized so the swept
          gradient band has room to travel across the mask. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-bdas-loader-shine animate-bdas-loader-sweep motion-reduce:hidden"
        style={{
          WebkitMaskImage: `url(${LOGO_URL})`,
          maskImage: `url(${LOGO_URL})`,
          WebkitMaskSize: "contain",
          maskSize: "contain",
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat",
          WebkitMaskPosition: "center",
          maskPosition: "center",
          backgroundSize: "220% 220%",
          backgroundRepeat: "no-repeat",
        }}
      />

      {/* A cap-clipped copy of the same logo that bobs + flicks on arrival.
          The clip-path and transform-origin below are hand-fitted to
          bdas-logo.png's composition (cap in the upper-right); re-fit them if
          that asset is ever re-exported. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 animate-bdas-loader-cap motion-reduce:animate-none"
        style={{
          backgroundImage: `url(${LOGO_URL})`,
          backgroundSize: "contain",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center",
          clipPath: "inset(16% 0% 60% 73%)",
          transformOrigin: "88% 36%",
        }}
      />
    </div>
  );
}
