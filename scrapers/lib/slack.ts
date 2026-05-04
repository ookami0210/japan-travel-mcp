/**
 * Slack notification helper.
 *
 * Reads SLACK_WEBHOOK_URL from environment. If unset, falls back to stderr
 * logging — the scraper never fails just because Slack is unreachable.
 */

const WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

export type Level = "info" | "warn" | "error";

const EMOJI: Record<Level, string> = {
  info: "ℹ️",
  warn: "⚠️",
  error: "🚨",
};

export async function notify(message: string, level: Level = "info"): Promise<void> {
  const formatted = `${EMOJI[level]} *Japan Travel MCP* — ${message}`;
  if (!WEBHOOK_URL) {
    console.error(`[slack:${level}] ${message}`);
    return;
  }
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: formatted }),
    });
    if (!res.ok) {
      console.error(
        `[slack] webhook returned ${res.status} ${res.statusText}`,
      );
    }
  } catch (err) {
    console.error("[slack] webhook failed:", err);
  }
}

export async function notifyMulti(
  blocks: Array<{ level: Level; message: string }>,
): Promise<void> {
  for (const b of blocks) {
    await notify(b.message, b.level);
  }
}
