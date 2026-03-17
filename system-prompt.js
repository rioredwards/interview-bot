import fs from "fs";

export function getSystemPrompt() {
  try {
    const prompt = fs.readFileSync("system-prompt.xml", "utf8");
    if (!prompt) {
      throw new Error("System prompt file is empty");
    }
    return prompt;
  } catch (error) {
    console.error("Error reading system prompt:", error);
    return "Something went wrong. Please try again.";
  }
}
