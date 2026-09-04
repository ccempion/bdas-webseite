import React from "react";

export function highlightMatches(text: string, query: string): React.ReactNode {
  // If query is empty, return text unchanged
  if (!query) {
    return text;
  }

  // Escape regex special characters in the query
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Split text by case-insensitive matches, capturing the matches
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));

  // Map over parts: even indices are non-matches, odd indices are matches
  return parts.map((part, index) =>
    index % 2 === 1 ? (
      <mark key={index} className="rounded-bdas-sm bg-bdas-red/15 px-0.5">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}
