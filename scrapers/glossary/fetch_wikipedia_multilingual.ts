/**
 * Fetch Wikipedia sitelink titles in 17 target languages for every Wikidata
 * attraction we already collected.
 *
 * Why: Wikipedia article titles are human-curated, peer-reviewed translations.
 * Using them as the gold-standard reference for tourism entity names produces
 * consistent, defensible translations (e.g. 厳島神社 → "Itsukushima Shrine"
 * in en, "厳島神社" in zh, "이쓰쿠시마 신사" in ko, etc.).
 *
 * Languages targeted (aligned with high-volume Japan inbound markets +
 * the 11 JNTO foreign-language exam languages):
 *
 *   ja en zh ko fr es de it pt ru th vi id ms ar hi tl
 *
 * (zh.wikipedia.org auto-converts between Hans/Hant. zh-Hans / zh-Hant
 * variant resolution happens at the AI translation layer in Phase 4.)
 *
 * Output: data/glossary/wikipedia_multilingual.json
 *
 * Performance: 41,404 QIDs / 50 per query = ~830 SPARQL requests. Wikidata
 * tolerates ~1 query/sec from a single client, so plan ~15 min wall time.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = new URL("../../", import.meta.url);
const ATTRACTIONS_PATH = new URL(
  "data/_state/wikidata_attractions.json",
  ROOT,
);
const OUTPUT_PATH = new URL("data/glossary/wikipedia_multilingual.json", ROOT);
const OUTPUT_JSONL = new URL(
  "data/translations/multilingual_wikipedia.jsonl",
  ROOT,
);

const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
const USER_AGENT =
  "JapanTravelMCP/0.0.1 (+https://github.com/ookami0210/japan-travel-mcp)";

// 17 target languages.
// Each entry: language code → wiki host code.
const LANGUAGES: Array<{ lang: string; wiki: string }> = [
  { lang: "ja", wiki: "ja" },
  { lang: "en", wiki: "en" },
  { lang: "zh", wiki: "zh" },
  { lang: "ko", wiki: "ko" },
  { lang: "fr", wiki: "fr" },
  { lang: "es", wiki: "es" },
  { lang: "de", wiki: "de" },
  { lang: "it", wiki: "it" },
  { lang: "pt", wiki: "pt" },
  { lang: "ru", wiki: "ru" },
  { lang: "th", wiki: "th" },
  { lang: "vi", wiki: "vi" },
  { lang: "id", wiki: "id" },
  { lang: "ms", wiki: "ms" },
  { lang: "ar", wiki: "ar" },
  { lang: "hi", wiki: "hi" },
  { lang: "tl", wiki: "tl" },
];

const BATCH_SIZE = 50;
const POLITE_DELAY_MS = 1100;

interface Attraction {
  qid: string;
  name_ja: string | null;
  [key: string]: unknown;
}

interface SparqlValue {
  value: string;
}

type SitelinkBindings = Record<string, SparqlValue | undefined>;

function buildQuery(qids: string[]): string {
  const values = qids.map((q) => `wd:${q}`).join(" ");
  // Build OPTIONAL clauses for each language.
  const optionals = LANGUAGES.map(({ lang, wiki }) => {
    return `  OPTIONAL {
    ?${lang}_url schema:about ?item ;
                 schema:isPartOf <https://${wiki}.wikipedia.org/> ;
                 schema:name ?${lang}_title .
  }`;
  }).join("\n");

  const selectVars = LANGUAGES.flatMap(({ lang }) => [
    `?${lang}_url`,
    `?${lang}_title`,
  ]).join(" ");

  return `
SELECT ?item ${selectVars} WHERE {
  VALUES ?item { ${values} }
${optionals}
}
`.trim();
}

async function querySparql(query: string): Promise<SitelinkBindings[]> {
  const url = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}&format=json`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/sparql-results+json",
    },
  });
  if (!res.ok) {
    throw new Error(`Wikidata SPARQL HTTP ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as {
    results: { bindings: SitelinkBindings[] };
  };
  return json.results.bindings;
}

function qidFromUri(uri: string): string {
  return uri.split("/").pop() ?? "";
}

interface MultilingualPair {
  qid: string;
  titles: Record<string, string | null>;
  urls: Record<string, string | null>;
}

function emptyPair(qid: string): MultilingualPair {
  const titles: Record<string, string | null> = {};
  const urls: Record<string, string | null> = {};
  for (const { lang } of LANGUAGES) {
    titles[lang] = null;
    urls[lang] = null;
  }
  return { qid, titles, urls };
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  const raw = JSON.parse(
    await readFile(fileURLToPath(ATTRACTIONS_PATH), "utf8"),
  ) as { attractions: Attraction[] };

  const allQids = raw.attractions.map((a) => a.qid).filter(Boolean);
  process.stderr.write(
    `[wp-multi] starting ${allQids.length} QIDs in batches of ${BATCH_SIZE}\n`,
  );

  const byQid = new Map<string, MultilingualPair>();
  for (const qid of allQids) byQid.set(qid, emptyPair(qid));

  let batchIndex = 0;
  let totalBatches = Math.ceil(allQids.length / BATCH_SIZE);

  for (let i = 0; i < allQids.length; i += BATCH_SIZE) {
    batchIndex++;
    const slice = allQids.slice(i, i + BATCH_SIZE);
    const query = buildQuery(slice);
    let bindings: SitelinkBindings[] = [];
    let attempt = 0;
    while (attempt < 3) {
      attempt++;
      try {
        bindings = await querySparql(query);
        break;
      } catch (e) {
        process.stderr.write(
          `[wp-multi] batch ${batchIndex}/${totalBatches} attempt ${attempt} error: ${(e as Error).message}\n`,
        );
        await sleep(5000 * attempt);
      }
    }

    for (const b of bindings) {
      const qid = qidFromUri(b.item?.value ?? "");
      if (!qid) continue;
      const rec = byQid.get(qid) ?? emptyPair(qid);
      for (const { lang } of LANGUAGES) {
        const titleVal = b[`${lang}_title`]?.value ?? null;
        const urlVal = b[`${lang}_url`]?.value ?? null;
        if (titleVal && !rec.titles[lang]) rec.titles[lang] = titleVal;
        if (urlVal && !rec.urls[lang]) rec.urls[lang] = urlVal;
      }
      byQid.set(qid, rec);
    }

    if (batchIndex % 10 === 0 || batchIndex === totalBatches) {
      const filledLangs: Record<string, number> = {};
      for (const { lang } of LANGUAGES) filledLangs[lang] = 0;
      for (const rec of byQid.values()) {
        for (const { lang } of LANGUAGES) {
          if (rec.titles[lang]) filledLangs[lang]++;
        }
      }
      process.stderr.write(
        `[wp-multi] batch ${batchIndex}/${totalBatches} (${i + slice.length}/${allQids.length} qids) coverage: ${JSON.stringify(filledLangs)}\n`,
      );
    }

    await sleep(POLITE_DELAY_MS);
  }

  const pairs = Array.from(byQid.values());

  // Stats per language.
  const stats: Record<string, number> = { total: pairs.length };
  for (const { lang } of LANGUAGES) {
    stats[`with_${lang}`] = pairs.filter((p) => p.titles[lang]).length;
  }
  // Coverage breadth: count of records with N or more languages filled.
  const coverageHistogram: Record<string, number> = {};
  for (const p of pairs) {
    const filled = Object.values(p.titles).filter((v) => v !== null).length;
    coverageHistogram[String(filled)] =
      (coverageHistogram[String(filled)] ?? 0) + 1;
  }

  await mkdir(dirname(fileURLToPath(OUTPUT_PATH)), { recursive: true });
  await mkdir(dirname(fileURLToPath(OUTPUT_JSONL)), { recursive: true });

  const out = {
    source: "Wikidata sitelinks → multilingual Wikipedia article titles",
    license: "CC BY-SA 4.0 (Wikipedia content); CC0 (Wikidata identifiers)",
    fetched_at: new Date().toISOString(),
    languages: LANGUAGES.map((l) => l.lang),
    stats,
    coverage_histogram: coverageHistogram,
    pairs,
  };
  await writeFile(fileURLToPath(OUTPUT_PATH), JSON.stringify(out, null, 2));

  // Also write JSONL (Hugging Face dataset compatible).
  const lines: string[] = [];
  for (const p of pairs) {
    if (!p.titles.ja) continue; // require ja anchor
    const entry: Record<string, unknown> = {
      qid: p.qid,
      source: "wikipedia_sitelinks",
    };
    for (const { lang } of LANGUAGES) {
      entry[lang] = p.titles[lang];
    }
    lines.push(JSON.stringify(entry));
  }
  await writeFile(fileURLToPath(OUTPUT_JSONL), lines.join("\n") + "\n");

  process.stderr.write(
    `[wp-multi] done. ${pairs.length} pairs, jsonl rows=${lines.length}, json=${fileURLToPath(OUTPUT_PATH)}\n`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
