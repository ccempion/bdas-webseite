"use client";

import dynamic from "next/dynamic";

import { BdasLoader } from "../../components/BdasLoader";
import type { GroupPin } from "./pins";

const GroupMap = dynamic(() => import("./GroupMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-72 w-full items-center justify-center rounded-bdas border border-bdas-soft bg-bdas-overlay-hover sm:h-[420px]">
      <BdasLoader size="lg" />
    </div>
  ),
});

export function GroupMapLazy({ pins }: { pins: GroupPin[] }) {
  return <GroupMap pins={pins} />;
}
