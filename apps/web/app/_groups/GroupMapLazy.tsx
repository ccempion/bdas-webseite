"use client";

import dynamic from "next/dynamic";

import type { GroupPin } from "./pins";

const GroupMap = dynamic(() => import("./GroupMap"), {
  ssr: false,
  loading: () => (
    <div
      aria-hidden="true"
      className="h-72 w-full animate-pulse rounded-bdas border border-bdas-soft bg-bdas-overlay-hover sm:h-[420px]"
    />
  ),
});

export function GroupMapLazy({ pins }: { pins: GroupPin[] }) {
  return <GroupMap pins={pins} />;
}
