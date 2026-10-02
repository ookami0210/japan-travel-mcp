/**
 * Identifies scraped records that belong to the event catalog rather than
 * the place catalog. Structured Schema.org Event data is authoritative; URL
 * classification is a fallback for official pages that omit JSON-LD.
 */

interface EventPageRecord {
  url?: string | null;
  source_url?: string | null;
  schema_events?: unknown[] | null;
}

const EVENT_PATH_SEGMENT = /^(?:events?|festivals?|matsuri)(?:(?:[-_](?:detail|details|info|information|list|calendar|schedule|archive|archives|index))|(?:\.(?:html?|php|aspx?)))?$/iu;
const EVENT_PATH_JA = /^(?:イベント|祭り?|まつり)(?:\.(?:html?|php|aspx?))?$/u;

export function isEventSpecificUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const pathname = decodeURIComponent(new URL(value).pathname);
    return pathname
      .split("/")
      .filter(Boolean)
      .some((segment) => EVENT_PATH_SEGMENT.test(segment) || EVENT_PATH_JA.test(segment));
  } catch {
    return false;
  }
}

export function hasStructuredEvent(record: EventPageRecord): boolean {
  return Array.isArray(record.schema_events) && record.schema_events.length > 0;
}

export function isEventPageRecord(record: EventPageRecord): boolean {
  return (
    hasStructuredEvent(record) ||
    isEventSpecificUrl(record.url) ||
    isEventSpecificUrl(record.source_url)
  );
}
