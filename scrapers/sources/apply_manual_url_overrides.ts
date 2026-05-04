/**
 * Apply manual overrides to data/_state/official_urls.json.
 *
 * Two purposes:
 *   1. Fill gaps where Wikidata's P856 (official website) is missing for a
 *      municipality that exists and has a real official site.
 *   2. Mark municipalities that exist on paper but have no functional site
 *      (e.g. Northern Territories villages under Russian administration).
 *
 * This file is the single place these manual decisions are recorded.
 */

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const PATH = new URL("../../data/_state/official_urls.json", import.meta.url);

interface UrlEntry {
  code: string;
  name: string;
  official_url: string | null;
  wikidata_qid: string;
  manual_override?: boolean;
  manual_reason?: string;
  out_of_scope?: boolean;
  out_of_scope_reason?: string;
}

interface FileShape {
  source: unknown;
  fetched_at: string;
  prefectures_fetched: string[];
  total_records: number;
  records_with_url: number;
  records_out_of_scope?: number;
  entries: UrlEntry[];
}

const MANUAL_OVERRIDES: Record<
  string,
  { official_url: string | null; reason: string }
> = {
  // Bona fide municipalities whose Wikidata P856 was empty:
  "282146": {
    official_url: "https://www.city.takarazuka.hyogo.jp/",
    reason: "Wikidata P856 was empty; canonical municipal site verified manually.",
  },

  // Northern Territories: claimed by Japan, currently under Russian
  // administration. No functional Japanese municipal site exists.
  "016951": {
    official_url: null,
    reason: "北方領土 (色丹村) — under Russian administration; no functional municipal site.",
  },
  "016969": {
    official_url: null,
    reason: "北方領土 (泊村, 国後島) — under Russian administration; no functional municipal site.",
  },
  "016977": {
    official_url: null,
    reason: "北方領土 (留夜別村, 国後島) — under Russian administration; no functional municipal site.",
  },
  "016985": {
    official_url: null,
    reason: "北方領土 (留別村, 択捉島) — under Russian administration; no functional municipal site.",
  },
  "016993": {
    official_url: null,
    reason: "北方領土 (紗那村, 択捉島) — under Russian administration; no functional municipal site.",
  },
  "017001": {
    official_url: null,
    reason: "北方領土 (蘂取村, 択捉島) — under Russian administration; no functional municipal site.",
  },
};

async function main(): Promise<void> {
  const path = fileURLToPath(PATH);
  const data = JSON.parse(await readFile(path, "utf8")) as FileShape;

  let added = 0;
  let outOfScope = 0;

  for (const [code, override] of Object.entries(MANUAL_OVERRIDES)) {
    let entry = data.entries.find((e) => e.code === code);
    if (!entry) {
      entry = {
        code,
        name: "",
        official_url: null,
        wikidata_qid: "",
      };
      data.entries.push(entry);
    }

    if (override.official_url) {
      if (!entry.official_url) {
        entry.official_url = override.official_url;
        entry.manual_override = true;
        entry.manual_reason = override.reason;
        added += 1;
      }
    } else {
      entry.official_url = null;
      entry.out_of_scope = true;
      entry.out_of_scope_reason = override.reason;
      outOfScope += 1;
    }
  }

  data.entries.sort((a, b) => a.code.localeCompare(b.code));

  data.records_with_url = data.entries.filter((e) => e.official_url).length;
  data.records_out_of_scope = data.entries.filter((e) => e.out_of_scope).length;

  await writeFile(path, JSON.stringify(data, null, 2), "utf8");

  console.error(`[manual_url_overrides] applied: +${added} URLs, ${outOfScope} marked out-of-scope`);
  console.error(
    `[manual_url_overrides] coverage: ${data.records_with_url} URLs + ${data.records_out_of_scope ?? 0} out-of-scope = ${data.records_with_url + (data.records_out_of_scope ?? 0)} / ${data.entries.length}`,
  );
}

main().catch((err) => {
  console.error("[manual_url_overrides] FAILED:", err);
  process.exit(1);
});
