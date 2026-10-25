// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { Wordmark } from "./Wordmark";

describe("Wordmark", () => {
  it("exposes the title as an accessible name and hides the decorative SVG", () => {
    const el = Wordmark("ExpoRush");
    expect(el.getAttribute("role")).toBe("img");
    expect(el.getAttribute("aria-label")).toBe("ExpoRush");
    expect(el.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("renders the title as SVG text (procedural, no bundled font/image)", () => {
    const el = Wordmark("ExpoRush");
    expect(el.querySelector("text")?.textContent).toBe("ExpoRush");
    expect(el.querySelector("image")).toBeNull();
  });

  it("defaults to the hero size and switches on request", () => {
    expect(Wordmark("ExpoRush").dataset.size).toBe("hero");
    expect(Wordmark("ExpoRush", { size: "compact" }).dataset.size).toBe("compact");
  });
});
