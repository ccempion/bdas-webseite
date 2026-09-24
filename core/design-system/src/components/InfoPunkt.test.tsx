// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { InfoPunkt } from "./InfoPunkt";

afterEach(cleanup);

const button = (name: string) => screen.getByRole("button", { name: `Was bedeutet „${name}“?` });

describe("InfoPunkt", () => {
  it("opens on click and closes on a second click", () => {
    render(<InfoPunkt begriff="Verteiler">Ein Ordner.</InfoPunkt>);
    expect(screen.queryByRole("note")).toBeNull();
    expect(button("Verteiler").getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(button("Verteiler"));
    const note = screen.getByRole("note");
    expect(note.textContent).toContain("Verteiler");
    expect(note.textContent).toContain("Ein Ordner.");
    expect(button("Verteiler").getAttribute("aria-expanded")).toBe("true");
    expect(button("Verteiler").getAttribute("aria-controls")).toBe(note.id);

    fireEvent.click(button("Verteiler"));
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("closes on Escape and returns focus to its button", () => {
    render(<InfoPunkt begriff="Lead">Leitet die Gruppe.</InfoPunkt>);
    fireEvent.click(button("Lead"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("note")).toBeNull();
    expect(document.activeElement).toBe(button("Lead"));
  });

  it("closes on a pointer press outside, not inside", () => {
    render(
      <div>
        <InfoPunkt begriff="Lead">Leitet die Gruppe.</InfoPunkt>
        <p>Anderswo</p>
      </div>,
    );
    fireEvent.click(button("Lead"));
    fireEvent.pointerDown(screen.getByRole("note"));
    expect(screen.queryByRole("note")).not.toBeNull();
    fireEvent.pointerDown(screen.getByText("Anderswo"));
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("keeps only one bubble open at a time", () => {
    render(
      <>
        <InfoPunkt begriff="Lead">A</InfoPunkt>
        <InfoPunkt begriff="Verteiler">B</InfoPunkt>
      </>,
    );
    fireEvent.click(button("Lead"));
    fireEvent.click(button("Verteiler"));
    const notes = screen.getAllByRole("note");
    expect(notes).toHaveLength(1);
    expect(notes[0]?.textContent).toContain("B");
  });

  it("shows the Mehr-dazu link only with a target", () => {
    const { rerender } = render(<InfoPunkt begriff="Lead">A</InfoPunkt>);
    fireEvent.click(button("Lead"));
    expect(screen.queryByRole("link")).toBeNull();

    rerender(
      <InfoPunkt begriff="Lead" mehrHref="/faq#x">
        A
      </InfoPunkt>,
    );
    expect(screen.getByRole("link", { name: "Mehr dazu →" }).getAttribute("href")).toBe("/faq#x");
  });

  it("calls onOpen once per opening", () => {
    const onOpen = vi.fn();
    render(
      <InfoPunkt begriff="Lead" onOpen={onOpen}>
        A
      </InfoPunkt>,
    );
    fireEvent.click(button("Lead"));
    fireEvent.click(button("Lead"));
    fireEvent.click(button("Lead"));
    expect(onOpen).toHaveBeenCalledTimes(2);
  });
});
