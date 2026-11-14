/**
 * Fetch the volcanic alert levels (噴火警戒レベル) in effect, from the
 * Japan Meteorological Agency (気象庁).
 *
 * Channels (both published by JMA; see scrapers/lib/jma_volcano.ts):
 *   Primary   — JMA XML Atom feeds (地震火山):
 *                 https://www.data.jma.go.jp/developer/xml/feed/eqvol.xml
 *                 https://www.data.jma.go.jp/developer/xml/feed/eqvol_l.xml
 *               Every 噴火警報・予報 (VFVO50) and 火山の状況に関する解説情報
 *               (VFVO51) bulletin in the feeds is read.
 *   Secondary — JMA bosai JSON:
 *                 https://www.jma.go.jp/bosai/volcano/const/volcano_list.json
 *                 https://www.jma.go.jp/bosai/volcano/data/warning/<code>.json
 *                 https://www.jma.go.jp/bosai/volcano/data/info/<code>.json
 *               The volcano list, and the latest 噴火警報・予報 on file per
 *               volcano — which reaches volcanoes whose last bulletin has
 *               already left the Atom feed (the feed covers only a few days).
 *               For a volcano still without a bulletin after that, the latest
 *               解説情報 on file, which restates the alert in effect.
 *
 * Per volcano, the newest bulletin across both channels decides. A volcano no
 * bulletin speaks for is written as `status: "unknown"` — never as Level 1.
 *
 * Output: data/r3/jma_volcano.json
 *
 * Run:
 *   npx tsx scrapers/sources/fetch_jma_volcano.ts
 *   JMA_VOLCANO_LIMIT=5 npx tsx scrapers/sources/fetch_jma_volcano.ts   (test mode)
 */

import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  parseAtomFeed,
  parseBosaiBulletin,
  parseBulletinXml,
  parseVolcanoList,
  resolveVolcanoRecords,
  type AlertObservation,
  type BosaiBulletinKind,
  type JmaVolcanoRecord,
} from "../lib/jma_volcano.js";

const ATOM_FEEDS = [
  "https://www.data.jma.go.jp/developer/xml/feed/eqvol.xml",
  "https://www.data.jma.go.jp/developer/xml/feed/eqvol_l.xml",
];
const VOLCANO_LIST_URL =
  "https://www.jma.go.jp/bosai/volcano/const/volcano_list.json";
const BOSAI_BULLETIN_URL = (kind: BosaiBulletinKind, code: string) =>
  `https://www.jma.go.jp/bosai/volcano/data/${kind}/${code}.json`;
const USER_AGENT =
  "JapanTravelMCP/1.0 (+https://github.com/ookami0210/japan-travel-mcp)";
const RATE_LIMIT_MS = 1500;

/** Source block written at the top of data/r3/jma_volcano.json. */
export const JMA_VOLCANO_SOURCE = {
  name: "JMA volcanic alert levels in effect (噴火警報・予報 / 噴火警戒レベル)",
  authority: "気象庁 (Japan Meteorological Agency)",
  url: "https://www.jma.go.jp/bosai/map.html#contents=volcano",
  channels: {
    primary: "JMA XML Atom feed (eqvol / eqvol_l): VFVO50 噴火警報・予報, VFVO51 火山の状況に関する解説情報",
    secondary: "JMA bosai JSON: /bosai/volcano/const/volcano_list.json, /bosai/volcano/data/{warning,info}/<code>.json",
  },
  license:
    "公共データ利用規約 (第1.0版) — 気象庁ホームページ利用規約 https://www.jma.go.jp/jma/kishou/info/coment.html",
  attribution:
    "出典：気象庁ホームページ (https://www.jma.go.jp/bosai/map.html#contents=volcano) を加工して作成 / Source: Japan Meteorological Agency, restructured per volcano",
  notice:
    "Relays the alert JMA has issued; it is not an independent warning. status=unknown means no JMA bulletin was available — it does not mean Level 1. Read a record older than 48 h (as_of) as unknown, and confirm with JMA before acting on it.",
};

interface FetchOutcome {
  status: number;
  body: string | null;
  error?: string;
}

async function politeGet(url: string): Promise<FetchOutcome> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "ja" },
    });
    const body = res.ok ? await res.text() : null;
    return { status: res.status, body };
  } catch (err) {
    return { status: 0, body: null, error: (err as Error).message };
  } finally {
    await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
  }
}

export interface JmaVolcanoRun {
  records: JmaVolcanoRecord[];
  channels: {
    atom_feeds_ok: number;
    atom_bulletins_read: number;
    atom_bulletins_failed: number;
    bosai_warning_found: number;
    bosai_info_found: number;
    bosai_none_on_file: number;
    bosai_failed: number;
  };
}

export async function fetchJmaVolcano(): Promise<JmaVolcanoRun> {
  const limit = parseInt(process.env.JMA_VOLCANO_LIMIT ?? "0", 10);

  // The volcano list is what lets a volcano with no bulletin appear as
  // `unknown` instead of vanishing. Without it, fail the run so the previous
  // file (and its as_of) stays in place.
  const list = await politeGet(VOLCANO_LIST_URL);
  if (!list.body) {
    throw new Error(
      `volcano list unavailable (HTTP ${list.status}${list.error ? `, ${list.error}` : ""})`,
    );
  }
  let volcanoes = parseVolcanoList(JSON.parse(list.body));
  if (volcanoes.length === 0) throw new Error("volcano list parsed empty");
  if (limit > 0) volcanoes = volcanoes.slice(0, limit);
  console.error(`[jma_volcano] volcano list: ${volcanoes.length} volcanoes`);

  const observations: AlertObservation[] = [];
  const channels: JmaVolcanoRun["channels"] = {
    atom_feeds_ok: 0,
    atom_bulletins_read: 0,
    atom_bulletins_failed: 0,
    bosai_warning_found: 0,
    bosai_info_found: 0,
    bosai_none_on_file: 0,
    bosai_failed: 0,
  };

  // Primary: Atom feeds → alert bulletins.
  const bulletinUrls = new Set<string>();
  for (const feed of ATOM_FEEDS) {
    const res = await politeGet(feed);
    if (!res.body) {
      console.error(`[jma_volcano] feed FAILED ${feed}: HTTP ${res.status} ${res.error ?? ""}`);
      continue;
    }
    channels.atom_feeds_ok += 1;
    for (const e of parseAtomFeed(res.body)) bulletinUrls.add(e.url);
  }
  console.error(`[jma_volcano] atom: ${bulletinUrls.size} alert bulletins in feeds`);
  for (const url of bulletinUrls) {
    const res = await politeGet(url);
    if (!res.body) {
      channels.atom_bulletins_failed += 1;
      console.error(`[jma_volcano] bulletin FAILED ${url}: HTTP ${res.status}`);
      continue;
    }
    channels.atom_bulletins_read += 1;
    observations.push(...parseBulletinXml(res.body, url));
  }

  // Secondary: per volcano, the latest 噴火警報・予報 on file, then — only
  // for volcanoes still without any bulletin — the latest 解説情報 on file.
  // 404 = JMA has nothing of that kind on file for the volcano.
  const lookupFailed = new Set<string>();
  const bosaiLookup = async (
    kind: BosaiBulletinKind,
    code: string,
  ): Promise<boolean> => {
    const res = await politeGet(BOSAI_BULLETIN_URL(kind, code));
    if (res.status === 404) return false;
    if (!res.body) {
      channels.bosai_failed += 1;
      lookupFailed.add(code);
      return false;
    }
    try {
      const found = parseBosaiBulletin(JSON.parse(res.body), kind);
      observations.push(...found);
      if (found.length > 0) {
        if (kind === "warning") channels.bosai_warning_found += 1;
        else channels.bosai_info_found += 1;
      }
      return found.length > 0;
    } catch {
      channels.bosai_failed += 1;
      lookupFailed.add(code);
      return false;
    }
  };
  for (const v of volcanoes) await bosaiLookup("warning", v.code);
  const covered = new Set(observations.map((o) => o.volcano_code));
  for (const v of volcanoes) {
    if (covered.has(v.code)) continue;
    const found = await bosaiLookup("info", v.code);
    if (!found && !lookupFailed.has(v.code)) channels.bosai_none_on_file += 1;
  }

  const asOf = new Date().toISOString();
  const listed = new Set(volcanoes.map((v) => v.code));
  const records = resolveVolcanoRecords(
    volcanoes,
    // In test mode keep the run to the volcanoes asked for.
    limit > 0 ? observations.filter((o) => listed.has(o.volcano_code)) : observations,
    asOf,
    lookupFailed,
  );
  const reported = records.filter((r) => r.status === "reported").length;
  console.error(
    `[jma_volcano] ${records.length} volcanoes: ${reported} reported, ${records.length - reported} unknown | ${JSON.stringify(channels)}`,
  );
  return { records, channels };
}

async function main(): Promise<void> {
  const { records, channels } = await fetchJmaVolcano();
  const out = {
    source: JMA_VOLCANO_SOURCE,
    channels,
    fetched_at: new Date().toISOString(),
    total: records.length,
    records,
  };
  const outPath = fileURLToPath(
    new URL("../../data/r3/jma_volcano.json", import.meta.url),
  );
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(out, null, 2), "utf8");
  console.error(`[jma_volcano] wrote ${records.length} records to ${outPath}`);
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((err) => {
    console.error("[jma_volcano] FAILED:", err);
    process.exit(1);
  });
}
