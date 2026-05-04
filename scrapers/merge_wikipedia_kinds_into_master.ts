/**
 * Merge Wikipedia category-derived kind_tags into the wikidata_attractions
 * master.json.
 *
 * Reads:
 *   data/r3/wikipedia_categories.json     (output of fetch_wikipedia_categories)
 *   data/_state/wikidata_attractions.json (master)
 *
 * Writes (in-place):
 *   data/_state/wikidata_attractions.json
 *
 * For each Wikipedia category page that links to a Wikidata QID we have
 * in the master, append the category's kind_tag to a new field
 * `wikipedia_kind_tags: string[]`. This is consumed at runtime by
 * `wikidataKinds()` so kinds_class_match scan can surface entities
 * tagged with hanabi / yuki_matsuri / yokocho / sakura_meisho / etc.
 *
 * Per project data principle: Wikipedia is CC BY-SA, the QID linkage is
 * automatic via wikibase_item, no curation. Records carry the kind_tag
 * with source=wikipedia_category for traceability.
 */

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");
const WIKI_FILE = resolve(REPO_ROOT, "data/r3/wikipedia_categories.json");
const MASTER_FILE = resolve(REPO_ROOT, "data/_state/wikidata_attractions.json");

interface WikiPage {
  pageid: number;
  title: string;
  qid: string | null;
  lat: number | null;
  lng: number | null;
  extract: string | null;
}

interface WikiCategoriesFile {
  fetched_at: string;
  total: number;
  categories: { title: string; kind_tag: string }[];
  by_category: Record<string, WikiPage[]>;
}

async function main(): Promise<void> {
  if (!existsSync(WIKI_FILE)) {
    process.stderr.write(`${WIKI_FILE} not found. Run fetch_wikipedia_categories.ts first.\n`);
    process.exit(1);
  }
  if (!existsSync(MASTER_FILE)) {
    process.stderr.write(`${MASTER_FILE} not found.\n`);
    process.exit(1);
  }

  process.stderr.write(`Loading ${WIKI_FILE}...\n`);
  const wiki = JSON.parse(await readFile(WIKI_FILE, "utf8")) as WikiCategoriesFile;
  // QID → set of kind_tags
  const qidKinds = new Map<string, Set<string>>();
  for (const cat of wiki.categories) {
    const pages = wiki.by_category[cat.title];
    if (!pages) continue;
    for (const p of pages) {
      if (!p.qid) continue;
      let s = qidKinds.get(p.qid);
      if (!s) { s = new Set(); qidKinds.set(p.qid, s); }
      s.add(cat.kind_tag);
    }
  }
  process.stderr.write(`Categories: ${qidKinds.size} QIDs\n`);

  // Iter64: also merge wikipedia_lists.json (canonical
  // list articles like 日本の花火大会一覧 / 日本100名城 / 日本三景 etc.).
  const LISTS_FILE = resolve(REPO_ROOT, "data/r3/wikipedia_lists.json");
  if (existsSync(LISTS_FILE)) {
    const lists = JSON.parse(await readFile(LISTS_FILE, "utf8")) as {
      lists: { title: string; kind_tag: string }[];
      by_list: Record<string, WikiPage[]>;
    };
    let listAdds = 0;
    for (const l of lists.lists) {
      const pages = lists.by_list[l.title];
      if (!pages) continue;
      for (const p of pages) {
        if (!p.qid) continue;
        let s = qidKinds.get(p.qid);
        if (!s) { s = new Set(); qidKinds.set(p.qid, s); }
        if (!s.has(l.kind_tag)) { s.add(l.kind_tag); listAdds += 1; }
      }
    }
    process.stderr.write(`Lists added ${listAdds} additional kind_tag bindings\n`);
  }

  process.stderr.write(`Total Wiki QIDs with kind_tags: ${qidKinds.size}\n`);

  process.stderr.write(`Loading ${MASTER_FILE}...\n`);
  const master = JSON.parse(await readFile(MASTER_FILE, "utf8")) as {
    attractions: Record<string, unknown>[];
  };
  const now = new Date().toISOString();
  let merged = 0;
  for (const a of master.attractions) {
    const qid = a.qid as string;
    if (!qid) continue;
    const tags = qidKinds.get(qid);
    if (!tags || tags.size === 0) continue;
    (a as Record<string, unknown>).wikipedia_kind_tags = Array.from(tags);
    (a as Record<string, unknown>).wikipedia_kind_tags_merged_at = now;
    merged += 1;
  }
  process.stderr.write(`Merged Wikipedia kind_tags into ${merged} / ${master.attractions.length} attractions.\n`);

  const tmp = MASTER_FILE + ".tmp";
  await writeFile(tmp, JSON.stringify(master, null, 2), "utf8");
  await import("node:fs/promises").then((m) => m.rename(tmp, MASTER_FILE));
  process.stderr.write(`Wrote ${MASTER_FILE}\n`);
}

await main();
