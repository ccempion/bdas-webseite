import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";
import { tailwindPreset } from "@bdas/design-system/tailwind-preset";

export default {
  presets: [tailwindPreset as Config],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    // Pull in design-system source so its class strings make it into the JIT pass.
    "../../core/design-system/src/**/*.{ts,tsx}",
  ],
  plugins: [typography],
} satisfies Config;
