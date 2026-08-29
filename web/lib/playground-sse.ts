export type ChatStreamEvent =
  | { type: "meta"; chosen: string; mock: boolean }
  | { type: "delta"; content: string }
  | { type: "done" }
  | { type: "error"; error: string };

export function encodeSse(event: ChatStreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export function parseSseBlock(block: string): ChatStreamEvent | null {
  const line = block
    .split("\n")
    .map((row) => row.trimEnd())
    .find((row) => row.startsWith("data:"));
  if (!line) {
    return null;
  }
  const payload = line.slice(5).trim();
  if (!payload || payload === "[DONE]") {
    return { type: "done" };
  }
  try {
    const parsed: unknown = JSON.parse(payload);
    if (!parsed || typeof parsed !== "object" || !("type" in parsed)) {
      return null;
    }
    return parsed as ChatStreamEvent;
  } catch {
    return null;
  }
}

export function chunkText(text: string, size = 12): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}
