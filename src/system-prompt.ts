import fs from "fs";
import path from "path";

export function getSystemPrompt(): string {
  const promptPath = path.resolve(
    import.meta.dirname,
    "..",
    "system-prompt.xml",
  );

  let prompt: string;
  try {
    prompt = fs.readFileSync(promptPath, "utf8");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read system prompt at ${promptPath}: ${detail}`);
  }

  if (prompt.trim() === "") {
    throw new Error(`System prompt file is empty at ${promptPath}`);
  }

  return prompt;
}
