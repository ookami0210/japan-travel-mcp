/**
 * Tolerant extraction of a JSON object from an LLM text response.
 *
 * Pure, side-effect-free (so it is unit-testable without running a translator).
 * Claude usually returns clean JSON, but for long free-text payloads (e.g. 17
 * tourism descriptions) it sometimes:
 *   - wraps the object in a ```json … ``` markdown fence, and/or
 *   - emits a raw newline/tab inside a string value, which is invalid JSON
 *     (control characters must be escaped) and makes JSON.parse throw.
 *
 * extractJsonObject strips a fence if present, isolates the outermost { … },
 * and — if a first strict parse fails — repairs raw control characters that
 * appear *inside* string literals (only there; structural whitespace is left
 * alone) before parsing again.
 */

/** Escape raw control chars that sit inside JSON string literals. */
function escapeControlCharsInStrings(json: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (const ch of json) {
    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      out += ch;
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      out += ch;
      continue;
    }
    if (inString) {
      if (ch === "\n") { out += "\\n"; continue; }
      if (ch === "\r") { out += "\\r"; continue; }
      if (ch === "\t") { out += "\\t"; continue; }
    }
    out += ch;
  }
  return out;
}

/**
 * Extract and parse the first complete JSON object from `text`.
 * Throws if no object can be recovered.
 */
export function extractJsonObject(text: string): unknown {
  let t = text.trim();

  // Strip a surrounding markdown code fence if present.
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence) t = fence[1].trim();

  const m = t.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("no JSON object found");
  const body = m[0];

  try {
    return JSON.parse(body);
  } catch {
    // Most common cause: raw control characters inside string values.
    return JSON.parse(escapeControlCharsInStrings(body));
  }
}
