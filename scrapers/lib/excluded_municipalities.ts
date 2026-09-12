/**
 * Municipality codes permanently excluded from japan-travel-mcp.
 *
 * The six villages in the Nemuro Subprefecture disputed-islands range are
 * claimed administratively but have no functioning municipal government or
 * public website. There is nothing to crawl and no tourism data to serve, so
 * they are out of scope for the dataset entirely: dropped when the municipality
 * list and centroids are generated, skipped by the steady scraper, and never
 * counted against the refresh SLA.
 *
 * This is a fixed, geographic list — it is not expected to change.
 */
export const EXCLUDED_MUNICIPALITY_CODES: ReadonlySet<string> = new Set([
  "016951",
  "016969",
  "016977",
  "016985",
  "016993",
  "017001",
]);

export function isExcludedMunicipality(code: string): boolean {
  return EXCLUDED_MUNICIPALITY_CODES.has(code);
}
