import fs from "fs";
import path from "path";

export function getSystemPrompt(): string {
  try {
    const promptPath = path.resolve(
      import.meta.dirname,
      "..",
      "system-prompt.xml",
    );
    const prompt = fs.readFileSync(promptPath, "utf8");
    if (!prompt) {
      throw new Error("System prompt file is empty");
    }
    return prompt;
  } catch (error) {
    console.error("Error reading system prompt:", error);
    return "Something went wrong. Please try again.";
  }
}
