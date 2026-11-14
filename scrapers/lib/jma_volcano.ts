/**
 * Decisions the JMA volcanic-alert fetcher makes without the network.
 *
 * The fetcher in `scrapers/sources/fetch_jma_volcano.ts` owns the requests,
 * the politeness and the output file. What lives here is everything it
 * decides from the responses alone — which feed entries are alert bulletins,
 * what a bulletin says about each volcano, which bulletin is the one in
 * effect, and when a record has to be reported as unknown — so those rules
 * can be tested against real JMA payloads instead of inferred from a run.
 *
 * Two channels, both published by the Japan Meteorological Agency:
 *
 *   1. JMA XML (Atom feed `eqvol` / `eqvol_l`). The feed lists only the
 *      bulletins of the last few days. The two report types that state the
 *      alert in effect for a volcano are read:
 *        VFVO50  噴火警報・予報             (the warning / forecast itself)
 *        VFVO51  火山の状況に関する解説情報   (commentary; restates the alert
 *                                              in effect, e.g. "が継続")
 *      Both carry a `VolcanoInfo type="…（対象火山）"` block whose `Kind` is
 *      the alert (レベル１–５, or a kind such as 火口周辺危険 for volcanoes
 *      without the level system).
 *   2. JMA bosai JSON, per volcano, in the same Kind structure:
 *        `/bosai/volcano/data/warning/<code>.json`  latest 噴火警報・予報 on file
 *        `/bosai/volcano/data/info/<code>.json`     latest 解説情報 on file
 *      This reaches volcanoes whose last bulletin has left the Atom feed.
 *
 * The rule that shapes every decision below: a level is reported only when a
 * JMA bulletin states it. A volcano with no bulletin in either channel, or
 * whose lookup failed, is `unknown` — never Level 1 by default.
 */

import * as cheerio from "cheerio";

/** A record older than this (by `as_of`) must be read as unknown. The
 *  rotation refreshes daily; one missed run is tolerated, two are not. */
export const STALE_AFTER_HOURS = 48;

/** JMA XML report-type codes that state the alert in effect for a volcano. */
export const ALERT_REPORT_TYPES = ["VFVO50", "VFVO51"] as const;

export type JmaVolcanoChannel = "jma_xml_atom" | "jma_bosai_json";

export type UnknownReason =
  | "no_bulletin_on_file"
  | "lookup_failed"
  | "latest_bulletin_cancelled";

export interface VolcanoEntry {
  /** JMA volcano code (e.g. "503" for 阿蘇山). */
  code: string;
  name_ja: string;
  name_en: string | null;
  lat: number | null;
  lon: number | null;
}

export interface FeedEntry {
  url: string;
  title: string;
  updated: string;
  /** JMA report-type code taken from the bulletin file name, e.g. "VFVO50". */
  report_type: string;
}

/** One statement, by one bulletin, of the alert in effect for one volcano. */
export interface AlertObservation {
  volcano_code: string;
  volcano_name_ja: string;
  /** Kind name exactly as JMA writes it, e.g. "レベル２（火口周辺規制）". */
  kind_name: string;
  kind_code: string;
  /** JMA's change marker for this bulletin: 継続 / 引上げ / 引下げ / 発表 / 解除 … */
  condition: string | null;
  issued_at: string;
  bulletin_title: string;
  bulletin_url: string;
  channel: JmaVolcanoChannel;
  /** True when the bulletin is a cancellation (InfoType 取消). */
  cancelled: boolean;
}

export interface JmaVolcanoRecord {
  source: "jma_volcano";
  authority: "気象庁 (Japan Meteorological Agency)";
  volcano_code: string;
  name_ja: string;
  name_en: string | null;
  lat: number | null;
  lon: number | null;
  /** `reported` when a JMA bulletin states the alert; otherwise `unknown`. */
  status: "reported" | "unknown";
  /** 1–5 for volcanoes under the 噴火警戒レベル system; null when the kind
   *  is not a level (e.g. 火口周辺危険) or when the status is unknown. */
  alert_level: number | null;
  alert_kind: string | null;
  alert_kind_code: string | null;
  alert_condition: string | null;
  issued_at: string | null;
  bulletin_title: string | null;
  bulletin_url: string | null;
  channel: JmaVolcanoChannel | null;
  unknown_reason: UnknownReason | null;
  /** When this record was assembled from JMA's responses. */
  as_of: string;
}

// ──────────────────────────────────────────────────────────────────────
// Parsing

/** Report-type code from a JMA XML file name
 *  (`…/20261104010017_0_VFVO50_016000.xml` → "VFVO50"). */
export function reportTypeFromUrl(url: string): string | null {
  const m = url.match(/_([A-Z]{4}\d{2})_[^/]*\.xml$/);
  return m ? m[1] : null;
}

/** Entries of a JMA Atom feed that are alert bulletins (VFVO50 / VFVO51). */
export function parseAtomFeed(xml: string): FeedEntry[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  const out: FeedEntry[] = [];
  const seen = new Set<string>();
  $("entry").each((_, el) => {
    const e = $(el);
    const url = e.find("link").attr("href") ?? e.find("id").text().trim();
    const type = reportTypeFromUrl(url);
    if (!type || !(ALERT_REPORT_TYPES as readonly string[]).includes(type)) {
      return;
    }
    if (seen.has(url)) return;
    seen.add(url);
    out.push({
      url,
      title: e.find("title").first().text().trim(),
      updated: e.find("updated").first().text().trim(),
      report_type: type,
    });
  });
  return out;
}

/** Alert statements in one JMA XML bulletin (VFVO50 / VFVO51).
 *  Training and test messages (Control/Status ≠ 通常) yield nothing. */
export function parseBulletinXml(
  xml: string,
  bulletinUrl: string,
): AlertObservation[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  if ($("Control > Status").first().text().trim() !== "通常") return [];

  const head = $("Head").first();
  const issuedAt = head.children("ReportDateTime").text().trim();
  const title = head.children("Title").text().trim().replace(/\s+/g, " ");
  const cancelled = head.children("InfoType").text().trim() === "取消";
  if (!issuedAt) return [];

  const out: AlertObservation[] = [];
  $("Body VolcanoInfo").each((_, info) => {
    const type = $(info).attr("type") ?? "";
    if (!type.endsWith("（対象火山）")) return;
    $(info)
      .children("Item")
      .each((__, item) => {
        const kind = $(item).children("Kind").first();
        const kindName = kind.children("Name").text().trim();
        const kindCode = kind.children("Code").text().trim();
        const condition = kind.children("Condition").text().trim() || null;
        $(item)
          .find("Areas > Area")
          .each((___, area) => {
            const code = $(area).children("Code").text().trim();
            if (!code) return;
            out.push({
              volcano_code: code,
              volcano_name_ja: $(area).children("Name").text().trim(),
              kind_name: kindName,
              kind_code: kindCode,
              condition,
              issued_at: issuedAt,
              bulletin_title: title,
              bulletin_url: bulletinUrl,
              channel: "jma_xml_atom",
              cancelled,
            });
          });
      });
  });
  return cancelled
    ? out.map((o) => ({ ...o, kind_name: "", kind_code: "" }))
    : out;
}

export type BosaiBulletinKind = "warning" | "info";

interface BosaiBulletinJson {
  headTitle?: string;
  reportDatetime?: string;
  infoType?: string;
  volcanoInfos?: Array<{
    type?: string;
    items?: Array<{
      name?: string;
      code?: string;
      condition?: string;
      areas?: Array<{ name?: string; code?: string }>;
    }>;
  }>;
}

/** JMA's own page for the latest bulletin of one kind for one volcano
 *  (噴火警報・予報 for `warning`, 解説情報 for `info`). */
export function bosaiBulletinPageUrl(
  volcanoCode: string,
  kind: BosaiBulletinKind,
): string {
  return `https://www.jma.go.jp/bosai/volcano/#type=${kind}&event_id=${volcanoCode}`;
}

/** Alert statements in one bosai `data/<kind>/<code>.json` response. */
export function parseBosaiBulletin(
  json: unknown,
  kind: BosaiBulletinKind,
): AlertObservation[] {
  const j = json as BosaiBulletinJson;
  if (!j || typeof j !== "object" || !j.reportDatetime) return [];
  const cancelled = j.infoType === "取消";
  const title = (j.headTitle ?? "").replace(/\s+/g, " ").trim();
  const out: AlertObservation[] = [];
  for (const info of j.volcanoInfos ?? []) {
    if (!(info.type ?? "").endsWith("（対象火山）")) continue;
    for (const item of info.items ?? []) {
      for (const area of item.areas ?? []) {
        if (!area.code) continue;
        out.push({
          volcano_code: area.code,
          volcano_name_ja: area.name ?? "",
          kind_name: cancelled ? "" : (item.name ?? ""),
          kind_code: cancelled ? "" : (item.code ?? ""),
          condition: item.condition ?? null,
          issued_at: j.reportDatetime,
          bulletin_title: title,
          bulletin_url: bosaiBulletinPageUrl(area.code, kind),
          channel: "jma_bosai_json",
          cancelled,
        });
      }
    }
  }
  return out;
}

interface BosaiVolcanoListItem {
  code?: string;
  name_jp?: string;
  name_en?: string;
  latlon?: [string, string];
}

/** Volcanoes in JMA's bosai volcano list. Codes 900+ are not volcanoes but
 *  grouping entries (全国の活火山 / その他の活火山 / 新たな活火山). */
export function parseVolcanoList(json: unknown): VolcanoEntry[] {
  if (!Array.isArray(json)) return [];
  const out: VolcanoEntry[] = [];
  for (const raw of json as BosaiVolcanoListItem[]) {
    if (!raw?.code || !raw.name_jp) continue;
    if (Number(raw.code) >= 900) continue;
    const lat = raw.latlon ? Number(raw.latlon[0]) : NaN;
    const lon = raw.latlon ? Number(raw.latlon[1]) : NaN;
    out.push({
      code: raw.code,
      name_ja: raw.name_jp,
      name_en: raw.name_en ?? null,
      lat: Number.isFinite(lat) ? lat : null,
      lon: Number.isFinite(lon) ? lon : null,
    });
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────────
// Decisions

/** 噴火警戒レベル from a JMA Kind code: 11–15 are レベル１–５. Every other
 *  code (火口周辺危険, 周辺海域警戒, 活火山であることに留意 for volcanoes
 *  without levels, …) is a kind, not a level. */
export function levelFromKindCode(code: string): number | null {
  const m = code.match(/^1([1-5])$/);
  return m ? Number(m[1]) : null;
}

function compareIssued(a: AlertObservation, b: AlertObservation): number {
  const ta = Date.parse(a.issued_at);
  const tb = Date.parse(b.issued_at);
  if (ta !== tb) return tb - ta; // newest first
  // Same bulletin seen through both channels: prefer the XML, whose URL is
  // the bulletin itself.
  if (a.channel !== b.channel) return a.channel === "jma_xml_atom" ? -1 : 1;
  return 0;
}

/**
 * One record per volcano. The newest bulletin across both channels decides;
 * a volcano no bulletin speaks for is `unknown`.
 *
 * @param lookupFailed volcano codes whose bosai lookup failed (network error
 *   or non-404 HTTP status) — distinguishes "JMA has nothing on file" from
 *   "we could not ask".
 */
export function resolveVolcanoRecords(
  volcanoes: VolcanoEntry[],
  observations: AlertObservation[],
  asOf: string,
  lookupFailed: ReadonlySet<string> = new Set(),
): JmaVolcanoRecord[] {
  const byCode = new Map<string, AlertObservation[]>();
  for (const o of observations) {
    if (Number.isNaN(Date.parse(o.issued_at))) continue;
    const list = byCode.get(o.volcano_code) ?? [];
    list.push(o);
    byCode.set(o.volcano_code, list);
  }

  // Volcanoes named by a bulletin but absent from the list still get a record.
  const entries = [...volcanoes];
  const listed = new Set(volcanoes.map((v) => v.code));
  for (const [code, obs] of byCode) {
    if (listed.has(code)) continue;
    entries.push({
      code,
      name_ja: obs[0].volcano_name_ja,
      name_en: null,
      lat: null,
      lon: null,
    });
  }

  return entries.map((v) => {
    const base = {
      source: "jma_volcano" as const,
      authority: "気象庁 (Japan Meteorological Agency)" as const,
      volcano_code: v.code,
      name_ja: v.name_ja,
      name_en: v.name_en,
      lat: v.lat,
      lon: v.lon,
      as_of: asOf,
    };
    const latest = (byCode.get(v.code) ?? []).sort(compareIssued)[0];
    if (!latest || latest.cancelled || !latest.kind_code) {
      const reason: UnknownReason = latest
        ? "latest_bulletin_cancelled"
        : lookupFailed.has(v.code)
          ? "lookup_failed"
          : "no_bulletin_on_file";
      return {
        ...base,
        status: "unknown" as const,
        alert_level: null,
        alert_kind: null,
        alert_kind_code: null,
        alert_condition: null,
        issued_at: latest?.issued_at ?? null,
        bulletin_title: latest?.bulletin_title ?? null,
        bulletin_url: latest?.bulletin_url ?? null,
        channel: latest?.channel ?? null,
        unknown_reason: reason,
      };
    }
    return {
      ...base,
      status: "reported" as const,
      alert_level: levelFromKindCode(latest.kind_code),
      alert_kind: latest.kind_name,
      alert_kind_code: latest.kind_code,
      alert_condition: latest.condition,
      issued_at: latest.issued_at,
      bulletin_title: latest.bulletin_title,
      bulletin_url: latest.bulletin_url,
      channel: latest.channel,
      unknown_reason: null,
    };
  });
}

/**
 * The alert a consumer may state for a record at time `now`. A record whose
 * `as_of` is older than STALE_AFTER_HOURS — the rotation stopped, or the file
 * was served from an old cache — reads as unknown, whatever level it holds.
 */
export function readAlert(
  record: Pick<JmaVolcanoRecord, "status" | "alert_level" | "alert_kind" | "as_of">,
  now: Date = new Date(),
): { status: "reported" | "unknown"; alert_level: number | null; alert_kind: string | null; stale: boolean } {
  const asOf = Date.parse(record.as_of);
  const stale =
    Number.isNaN(asOf) || now.getTime() - asOf > STALE_AFTER_HOURS * 3600_000;
  if (stale || record.status !== "reported") {
    return { status: "unknown", alert_level: null, alert_kind: null, stale };
  }
  return {
    status: "reported",
    alert_level: record.alert_level,
    alert_kind: record.alert_kind,
    stale: false,
  };
}
