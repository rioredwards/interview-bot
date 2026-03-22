import { describe, it, expect } from "vitest";
import { getSystemPrompt } from "../system-prompt.js";

describe("system-prompt", () => {
  it("returns a non-empty string", () => {
    const prompt = getSystemPrompt();
    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(0);
  });

  it("contains expected XML structure", () => {
    const prompt = getSystemPrompt();
    expect(prompt).toContain("<system_prompt>");
    expect(prompt).toContain("</system_prompt>");
  });

  it("contains Rio's identity information", () => {
    const prompt = getSystemPrompt();
    expect(prompt).toContain("Rio Edwards");
    expect(prompt).toContain("Portland, Oregon");
  });

  it("contains input safety rules", () => {
    const prompt = getSystemPrompt();
    expect(prompt).toContain("<input_safety>");
    expect(prompt).toContain("untrusted");
  });

  it("contains FAQ entries", () => {
    const prompt = getSystemPrompt();
    expect(prompt).toContain("<faq>");
    expect(prompt).toContain("What are his strongest projects?");
  });
});
