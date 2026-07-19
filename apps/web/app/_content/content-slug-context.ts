"use client";

import { createContext } from "react";

/** The content slug being edited. FotoField sends it with upload requests so
 *  the upload route can authorize group editors (ADR 0025). */
export const ContentSlugContext = createContext<string>("");
