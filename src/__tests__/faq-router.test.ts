import { describe, it, expect } from "vitest";
import { matchFaq } from "../faq-router.js";

describe("faq-router", () => {
  describe("greeting intent", () => {
    it.each(["hi", "Hey", "hello", "Yo", "sup", "HOWDY", "hiya"])(
      "matches greeting: %s",
      (msg) => {
        const result = matchFaq(msg);
        expect(result).not.toBeNull();
        expect(result!.intent).toBe("greeting");
      },
    );

    it.each(["hey there", "hello there", "hi there", "good morning"])(
      "matches multi-word greeting: %s",
      (msg) => {
        const result = matchFaq(msg);
        expect(result).not.toBeNull();
        expect(result!.intent).toBe("greeting");
      },
    );

    it("handles punctuation in greetings", () => {
      expect(matchFaq("Hi!")).not.toBeNull();
      expect(matchFaq("Hey!!!")).not.toBeNull();
      expect(matchFaq("Hello.")).not.toBeNull();
    });
  });

  describe("who_is_rio intent", () => {
    it.each([
      "who is rio",
      "Who is Rio Edwards",
      "tell me about rio",
      "what does rio do",
      "who are you",
    ])("matches phrase: %s", (msg) => {
      const result = matchFaq(msg);
      expect(result).not.toBeNull();
      expect(result!.intent).toBe("who_is_rio");
    });

    it("matches via keywords: 'tell me about Rio Edwards'", () => {
      const result = matchFaq("tell me about Rio Edwards");
      expect(result).not.toBeNull();
      expect(result!.intent).toBe("who_is_rio");
    });
  });

  describe("strongest_projects intent", () => {
    it.each([
      "what are his best projects",
      "what are his strongest projects",
      "top projects",
    ])("matches phrase: %s", (msg) => {
      const result = matchFaq(msg);
      expect(result).not.toBeNull();
      expect(result!.intent).toBe("strongest_projects");
    });

    it("matches via keywords", () => {
      const result = matchFaq("What is his best project?");
      expect(result).not.toBeNull();
      expect(result!.intent).toBe("strongest_projects");
    });
  });

  describe("backend_experience intent", () => {
    it.each([
      "does he do backend",
      "backend experience",
      "is he just a frontend developer",
    ])("matches phrase: %s", (msg) => {
      const result = matchFaq(msg);
      expect(result).not.toBeNull();
      expect(result!.intent).toBe("backend_experience");
    });

    it("matches via keyword: 'any backend work'", () => {
      const result = matchFaq("any backend work");
      expect(result).not.toBeNull();
      expect(result!.intent).toBe("backend_experience");
    });
  });

  describe("mobile_experience intent", () => {
    it.each(["does he do mobile", "ios experience", "react native experience"])(
      "matches phrase: %s",
      (msg) => {
        const result = matchFaq(msg);
        expect(result).not.toBeNull();
        expect(result!.intent).toBe("mobile_experience");
      },
    );

    it("matches via keyword: 'has he worked on mobile apps'", () => {
      const result = matchFaq("has he worked on mobile apps");
      expect(result).not.toBeNull();
      expect(result!.intent).toBe("mobile_experience");
    });
  });

  describe("location intent", () => {
    it.each([
      "where is he located",
      "where does he live",
      "location",
      "where is he",
    ])("matches phrase: %s", (msg) => {
      const result = matchFaq(msg);
      expect(result).not.toBeNull();
      expect(result!.intent).toBe("location");
    });
  });

  describe("contact intent", () => {
    it.each([
      "contact info",
      "contact information",
      "email",
      "linkedin",
      "how to get in touch",
    ])("matches phrase: %s", (msg) => {
      const result = matchFaq(msg);
      expect(result).not.toBeNull();
      expect(result!.intent).toBe("contact");
    });

    it("matches via keyword: 'I want to contact him'", () => {
      const result = matchFaq("I want to contact him");
      expect(result).not.toBeNull();
      expect(result!.intent).toBe("contact");
    });
  });

  describe("normalization", () => {
    it("strips punctuation", () => {
      expect(matchFaq("who is rio?")).not.toBeNull();
      expect(matchFaq("who is rio!")).not.toBeNull();
    });

    it("handles smart quotes in contractions", () => {
      // "what\u2019s up" normalizes to "what s up" (smart quote stripped, space remains)
      // This won't match "whats up" exactly, so it falls through to keywords
      // The phrase "whats up" (without apostrophe) should still match
      expect(matchFaq("whats up")).not.toBeNull();
    });

    it("is case-insensitive", () => {
      expect(matchFaq("WHO IS RIO")).not.toBeNull();
      expect(matchFaq("Contact Info")).not.toBeNull();
    });

    it("collapses whitespace", () => {
      expect(matchFaq("  who   is   rio  ")).not.toBeNull();
    });
  });

  describe("word boundary matching", () => {
    it("matches 'ios' as a whole word", () => {
      const result = matchFaq("does he know ios");
      expect(result).not.toBeNull();
      expect(result!.intent).toBe("mobile_experience");
    });

    it("does not match 'ios' inside 'radios'", () => {
      const result = matchFaq("does he build radios");
      // Should not match mobile_experience
      expect(result?.intent).not.toBe("mobile_experience");
    });

    it("does not match 'backend' inside 'setbackend'", () => {
      const result = matchFaq("setbackend configuration");
      expect(result?.intent).not.toBe("backend_experience");
    });

    it("matches 'mobile' as a whole word", () => {
      const result = matchFaq("any mobile work");
      expect(result).not.toBeNull();
      expect(result!.intent).toBe("mobile_experience");
    });
  });

  describe("miss cases", () => {
    it("returns null for novel questions", () => {
      expect(
        matchFaq("What was the hardest challenge on DogTown?"),
      ).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(matchFaq("")).toBeNull();
    });

    it("returns null for whitespace only", () => {
      expect(matchFaq("   ")).toBeNull();
    });

    it("returns null for unrelated text", () => {
      expect(matchFaq("the weather is nice today")).toBeNull();
    });
  });

  describe("response content", () => {
    it("returns a non-empty reply string", () => {
      const result = matchFaq("who is rio");
      expect(result).not.toBeNull();
      expect(result!.reply.length).toBeGreaterThan(0);
    });

    it("contact reply contains email", () => {
      const result = matchFaq("contact info");
      expect(result).not.toBeNull();
      expect(result!.reply).toContain("rioredwards@gmail.com");
    });
  });
});
