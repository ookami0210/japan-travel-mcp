/**
 * Deterministic extraction of opening hours, closed days and admission
 * prices from the visible text of a Japanese official page.
 *
 * WHY rules before any model: the way a Japanese operator writes its hours
 * is formulaic ("営業時間 9:00〜17:00", "定休日 水曜日", "大人500円"). A rule
 * that recognises the formula returns the exact characters the page shows,
 * so every structured value carries its own evidence and nothing is
 * invented. Pages the rules cannot read are left for a later pass, never
 * guessed.
 *
 * What the first canary taught the rules (each is a named guard below):
 *   - A chain's top page lists several stores' hours. Two hours blocks that
 *     disagree make the page ambiguous, and an ambiguous page yields null.
 *   - "受付時間" is a phone desk, "利用時間" next to 駐車場 is a parking
 *     meter, "料金" on a hotel page is anything from a towel to parking.
 *     Context around a label decides whether it is the venue's own hours.
 *   - "10:30〜5:00" on a restaurant page means 5 a.m. Japanese pages use the
 *     24 h clock, so a close earlier than the open is the next morning.
 *   - "ランチタイム 11:00〜15:00" inside "9:00〜18:00" is a service, not a
 *     second window. A window contained in another is dropped.
 *
 * Output contract:
 *   - `opening_hours` is written in the OSM opening_hours syntax that the
 *     server already structures (`src/lib/opening_hours.ts`), e.g.
 *     "Mo-Fr 09:00-17:00; Sa,Su,PH 10:00-18:00; We off". Null when no time
 *     range was found next to an hours label, or when the page is ambiguous.
 *   - `partial` is true when the page said something the rules do not model
 *     (seasonal ranges, "第2・4火曜日", "不定休", last-order notes). The
 *     structured part is then a subset of what the page says.
 *   - Every value has an `evidence` string copied verbatim from the page.
 *
 * Pure and side-effect-free. Unit-tested against real page phrasings.
 */

export type Weekday = "Mo" | "Tu" | "We" | "Th" | "Fr" | "Sa" | "Su" | "PH";

export interface HoursRule {
  /** Day set this rule applies to. Empty means "every day". */
  days: Weekday[];
  /** "HH:MM" 24h; close may exceed 24:00 for past-midnight windows. */
  open: string;
  close: string;
}

export interface HoursResult {
  /** OSM opening_hours syntax, or null when nothing parsed or ambiguous. */
  opening_hours: string | null;
  rules: HoursRule[];
  /** Weekdays the page names as closed. */
  closed_days: Weekday[];
  /** The page says it never closes (年中無休 / 無休). */
  open_every_day: boolean;
  /** Something on the page is not modelled (see file header). */
  partial: boolean;
  /** Two hours blocks on the page disagree (several venues on one page). */
  ambiguous: boolean;
  /** Verbatim page fragments the values were read from. */
  evidence: string[];
}

export interface PriceResult {
  adult_jpy: number | null;
  child_jpy: number | null;
  /** The page says admission is free. */
  free: boolean;
  /** A lodging "from" rate when that is all the page states (宿泊料金 12,000円〜). */
  from_jpy: number | null;
  evidence: string[];
}

export interface LodgingTimes {
  checkin: string | null;
  checkout: string | null;
  evidence: string[];
}

export interface PageFacts {
  hours: HoursResult | null;
  price: PriceResult | null;
  lodging: LodgingTimes | null;
  /** The page announces the venue has closed for good. */
  closure_notice: string | null;
}

// ──────────────────────────────────────────────────────────────────────
// Normalisation

const FULLWIDTH_DIGITS = "０１２３４５６７８９";

/** Fullwidth digits/colons/tildes to ASCII, collapse whitespace. Keeps the
 *  character count close to the original so evidence stays recognisable. */
export function normalizeJa(text: string): string {
  let s = text;
  for (let i = 0; i < 10; i += 1) {
    s = s.split(FULLWIDTH_DIGITS[i]).join(String(i));
  }
  return s
    .replace(/[：]/g, ":")
    .replace(/[〜～~–—‐−]/g, "〜")
    .replace(/[－]/g, "-")
    .replace(/[（]/g, "(")
    .replace(/[）]/g, ")")
    .replace(/[　]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\r/g, "")
    .replace(/\n{2,}/g, "\n");
}

// ──────────────────────────────────────────────────────────────────────
// Time parsing

/**
 * One clock time as written in Japanese prose. Returns minutes from
 * midnight, or null. Accepts "9:00", "9時", "9時30分", "午前9時", "午後5時",
 * "AM9:00", "PM5:00", "17時半".
 */
export function parseJaTime(raw: string): number | null {
  const s = raw.trim();
  const m = s.match(
    /^(午前|午後|AM|PM|am|pm|a\.m\.|p\.m\.)?\s*(\d{1,2})(?::(\d{2})|時\s*(\d{1,2})\s*分?|時(半)?)?\s*(AM|PM|am|pm)?$/,
  );
  if (!m) return null;
  let h = parseInt(m[2], 10);
  let min = 0;
  if (m[3] !== undefined) min = parseInt(m[3], 10);
  else if (m[4] !== undefined) min = parseInt(m[4], 10);
  else if (m[5] !== undefined) min = 30;
  if (min > 59) return null;
  const ampm = (m[1] ?? m[6] ?? "").toLowerCase().replace(/\./g, "");
  if (ampm === "午後" || ampm === "pm") {
    if (h < 12) h += 12;
  } else if (ampm === "午前" || ampm === "am") {
    if (h === 12) h = 0;
  }
  if (h > 29) return null;
  return h * 60 + min;
}

function fmt(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** A time such as "9:00", "午後5時30分", "翌2:00", "17時半". */
const TIME_TOKEN =
  "(?:翌\\s*)?(?:午前|午後|AM|PM|am|pm)?\\s*\\d{1,2}(?::\\d{2}|時(?:\\s*\\d{1,2}\\s*分?|半)?)\\s*(?:AM|PM|am|pm)?";

/** "9:00〜17:00", "9時から17時まで", "9:00-17:00", "9:00 to 17:00". */
const RANGE_RE = new RegExp(
  `(${TIME_TOKEN})\\s*(?:〜|-|から|より|to)\\s*(${TIME_TOKEN})(?:\\s*まで)?`,
  "g",
);

export interface ParsedRange {
  open: number;
  close: number;
  text: string;
  index: number;
}

function parseRange(openRaw: string, closeRaw: string): { open: number; close: number } | null {
  const nextDay = /^翌/.test(closeRaw.trim());
  const open = parseJaTime(openRaw.replace(/^翌\s*/, ""));
  let close = parseJaTime(closeRaw.replace(/^翌\s*/, ""));
  if (open === null || close === null) return null;
  if (nextDay) close += 24 * 60;
  if (close <= open && !nextDay) {
    // Japanese pages write the 24 h clock. A close at or before the open is
    // the next morning when it is an early hour ("22:00〜2:00", "11:00〜0:00");
    // anything else ("9〜5") is ambiguous and not read.
    if (close <= 6 * 60) close += 24 * 60;
    else return null;
  }
  if (close > 30 * 60 || open > 24 * 60) return null;
  return { open, close };
}

/** Every time range in a fragment, in order. */
export function findRanges(fragment: string): ParsedRange[] {
  const out: ParsedRange[] = [];
  RANGE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RANGE_RE.exec(fragment)) !== null) {
    const r = parseRange(m[1], m[2]);
    if (r) out.push({ ...r, text: m[0], index: m.index });
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────────
// Day parsing

const DAY_CHAR: Record<string, Weekday> = {
  月: "Mo",
  火: "Tu",
  水: "We",
  木: "Th",
  金: "Fr",
  土: "Sa",
  日: "Su",
  祝: "PH",
};
const ORDER: Weekday[] = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function expandRange(a: Weekday, b: Weekday): Weekday[] {
  const i = ORDER.indexOf(a);
  const j = ORDER.indexOf(b);
  if (i < 0 || j < 0) return [a, b];
  const out: Weekday[] = [];
  let k = i;
  for (;;) {
    out.push(ORDER[k]);
    if (k === j) break;
    k = (k + 1) % 7;
  }
  return out;
}

const UNMODELLED_DAY_RE =
  /第\s*[\d一二三四五]|不定|年末年始|季節|夏季|冬季|シーズン|期間|GW|お盆|振替|臨時|月\s*[一二三四\d]\s*回|月に|隔週|一部の/;

/** True when a parenthetical names days only ("(土・日・月)", "(平日)"). */
function parenIsDayList(s: string): boolean {
  const inner = s.replace(/^[(（]|[)）]$/g, "");
  return /^[月火水木金土日祝曜日平週末・,、/〜と\s]+$/.test(inner) && /[月火水木金土日祝]/.test(inner);
}

/**
 * Day words in a short fragment: "平日", "土日祝", "土・日・祝日", "月〜金",
 * "月曜日〜金曜日", "日曜・祝日", "毎週水曜日". Returns null when the
 * fragment names no days. `unmodelled` is set for words the rules do not
 * turn into a day set (第2・4, 不定, 年末年始, 季節, 月一回).
 */
export function parseDays(fragment: string): { days: Weekday[]; unmodelled: boolean } | null {
  // Remarks in parentheses are exceptions ("祝日の場合は翌日"), not day
  // sets, unless the parenthetical is nothing but day words.
  let body = "";
  let remark = "";
  let rest = fragment;
  for (;;) {
    const i = rest.search(/[(（]/);
    if (i < 0) {
      body += rest;
      break;
    }
    body += rest.slice(0, i);
    const j = rest.indexOf(")", i);
    const paren = j < 0 ? rest.slice(i) : rest.slice(i, j + 1);
    if (parenIsDayList(paren)) body += ` ${paren.slice(1, -1)} `;
    else remark += paren;
    rest = j < 0 ? "" : rest.slice(j + 1);
  }
  // "祝日の場合は営業" / "祝日営業" means open on holidays: not a closed day.
  // Then 祝日 is the holiday word, not 祝 + Sunday; 祝前日 is not a holiday.
  let s = body
    .replace(/祝(?:祭)?日[^。、\n]{0,10}?(?:営業|開館|開園|開場)/g, " ")
    .replace(/祝(?:祭)?日の翌(?:平)?日|翌(?:平)?日/g, " ")
    .replace(/祝前日/g, " ")
    .replace(/祝祭日|祝日|祭日/g, "祝")
    .replace(/\bMon(?:day)?\b/gi, "月曜")
    .replace(/\bTue(?:s|sday)?\b/gi, "火曜")
    .replace(/\bWed(?:nesday)?\b/gi, "水曜")
    .replace(/\bThu(?:rs|rsday)?\b/gi, "木曜")
    .replace(/\bFri(?:day)?\b/gi, "金曜")
    .replace(/\bSat(?:urday)?\b/gi, "土曜")
    .replace(/\bSun(?:day)?\b/gi, "日曜")
    .replace(/と/g, "・");
  let unmodelled = false;
  if (UNMODELLED_DAY_RE.test(s) || /祝日の場合|祝日の時|翌日|振替/.test(remark)) {
    unmodelled = true;
  }
  // "月一回水曜日", "一部の日曜日", "第3日曜日", "第2・4木曜日": an
  // occasional day, not a weekly one. "祝日の場合は営業" / "祝日営業" means
  // open on holidays, so it is not a closed day either.
  s = s
    .replace(/第\s*[\d一二三四五](?:\s*[・,、]\s*[\d一二三四五])*\s*[月火水木金土日]曜?日?/g, " ")
    .replace(/月\s*[一二三四\d]\s*回\s*[月火水木金土日]?曜?日?/g, " ")
    .replace(/一部の\s*[月火水木金土日]曜?日?/g, " ")
    .replace(/月に/g, " ");
  const set = new Set<Weekday>();
  if (/平日/.test(s)) for (const d of ["Mo", "Tu", "We", "Th", "Fr"] as Weekday[]) set.add(d);
  if (/週末/.test(s)) {
    set.add("Sa");
    set.add("Su");
  }
  // Ranges: 月〜金, 月曜〜金曜, 月曜日〜金曜日
  const rangeRe = /([月火水木金土日])(?:曜日?)?\s*〜\s*([月火水木金土日])(?:曜日?)?/g;
  let m: RegExpExecArray | null;
  let consumed = s;
  while ((m = rangeRe.exec(s)) !== null) {
    for (const d of expandRange(DAY_CHAR[m[1]], DAY_CHAR[m[2]])) set.add(d);
    consumed = consumed.replace(m[0], " ");
  }
  // Explicit weekday words: 水曜日, 毎週月曜, 日曜・祝
  const youRe =
    /((?:[月火水木金土日祝]\s*[・,、/]\s*)*)([月火水木金土日])曜(?:日)?((?:\s*[・,、/]\s*[月火水木金土日祝](?:曜日?)?)*)/g;
  while ((m = youRe.exec(consumed)) !== null) {
    set.add(DAY_CHAR[m[2]]);
    for (const ch of (m[1] + m[3]).replace(/[・,、/\s曜日]/g, "")) {
      const d = DAY_CHAR[ch];
      if (d) set.add(d);
    }
    consumed = consumed.replace(m[0], " ");
  }
  // A fragment that is nothing but one to three day characters ("月", "[金]",
  // "土・日") names those days; the prose guard below needs two.
  const bare = consumed.replace(/[\s\[\]【】()（）・,、/:：]/g, "");
  if (bare.length >= 1 && bare.length <= 3 && [...bare].every((ch) => DAY_CHAR[ch])) {
    for (const ch of bare) set.add(DAY_CHAR[ch]);
  }
  // "平日・土", "土日・祝": single day characters joined to a day word by ・
  const joinRe = /(?:平日|週末)\s*[・,、/]\s*((?:[月火水木金土日祝]\s*[・,、/]?\s*)+)/g;
  while ((m = joinRe.exec(consumed)) !== null) {
    for (const ch of m[1].replace(/[・,、/\s]/g, "")) {
      const d = DAY_CHAR[ch];
      if (d) set.add(d);
    }
  }
  // Compact lists: 土日祝, 土・日・祝, 月火水. Needs two or more day
  // characters, or a 祝, so a day kanji inside prose (本日, 金額) is skipped.
  const listRe = /(?:^|[^一-龥])((?:[月火水木金土日祝](?:\s*[・,、/]\s*)?){2,}|祝)/g;
  while ((m = listRe.exec(consumed)) !== null) {
    for (const ch of m[1].replace(/[・,、/\s]/g, "")) {
      const d = DAY_CHAR[ch];
      if (d) set.add(d);
    }
  }
  if (set.size === 0) return unmodelled ? { days: [], unmodelled } : null;
  return { days: ORDER.filter((d) => set.has(d)).concat(set.has("PH") ? ["PH"] : []), unmodelled };
}

function daysToOsm(days: Weekday[]): string {
  if (days.length === 0) return "";
  const week = days.filter((d) => d !== "PH");
  const ph = days.includes("PH");
  const parts: string[] = [];
  let i = 0;
  while (i < week.length) {
    let j = i;
    while (
      j + 1 < week.length &&
      ORDER.indexOf(week[j + 1]) === ORDER.indexOf(week[j]) + 1
    ) {
      j += 1;
    }
    if (j - i >= 2) parts.push(`${week[i]}-${week[j]}`);
    else for (let k = i; k <= j; k += 1) parts.push(week[k]);
    i = j + 1;
  }
  if (ph) parts.push("PH");
  return parts.join(",");
}

// ──────────────────────────────────────────────────────────────────────
// Hours

const HOURS_LABEL =
  "(?:営業時間|開館時間|開園時間|開場時間|開館|開園|開場|利用時間|拝観時間|参拝時間|入館時間|入園時間|見学時間|公開時間|営業日時|営業)";
const CLOSED_LABEL_STRONG = "(?:定休日|休館日|休園日|休業日|休場日|閉館日|定休|店休日)";
const CLOSED_LABEL_WEAK = "(?:休み|休日|休業|休館|休園|お休み|CLOSE|Close|closed|Closed)";
const UNMODELLED_NOTE =
  /最終入[場館園]|入[場館園]は|L\.?O\.?|ラストオーダー|受付終了|閉門|季節|時期|変動|異なり|要確認|お問い合わせ|により|変更/;
/** Words before or around a label that mark hours of something other than
 *  the venue itself: a phone desk, parking, a bath, a shuttle. */
const OFF_TOPIC_CONTEXT =
  /駐車|パーキング|電話|TEL|Tel|お問い?合わせ|予約受付|受付|フロント|大浴場|浴場|温泉|サウナ|プール|ジム|送迎|シャトル|バス|売店|コインランドリー|ランドリー|自販機|ATM/;
const SUB_LABEL_CLOSE = /[■【◆●▼［\[]|定休日|休館日|休園日|休業日|営業時間|開館時間|開園時間|料金|入館料|入場料|アクセス|住所|電話|TEL|ショップ|売店|物販|温泉|浴場/;

/** Fragment after a label, bounded so it stays on the label's own line/item. */
function windowAfter(text: string, index: number, max = 180): string {
  const slice = text.slice(index, index + max);
  const cut = slice.search(/\n\s*\n/);
  return cut > 0 ? slice.slice(0, cut) : slice;
}

interface Block {
  rules: HoursRule[];
  evidence: string;
}

function sameDays(a: Weekday[], b: Weekday[]): boolean {
  return a.length === b.length && a.every((d) => b.includes(d));
}

function overlapDays(a: Weekday[], b: Weekday[]): boolean {
  if (a.length === 0 || b.length === 0) return true;
  return a.some((d) => b.includes(d));
}

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((x) => parseInt(x, 10));
  return h * 60 + m;
}

/** Drop a rule whose window sits inside another rule's window on the same days. */
function dropContained(rules: HoursRule[]): HoursRule[] {
  return rules.filter((r, i) => {
    const o = toMin(r.open);
    const c = toMin(r.close);
    return !rules.some((other, j) => {
      if (i === j) return false;
      if (!(sameDays(r.days, other.days) || other.days.length === 0)) return false;
      const oo = toMin(other.open);
      const oc = toMin(other.close);
      return oo <= o && c <= oc && !(oo === o && oc === c);
    });
  });
}

/**
 * Two blocks disagree when they share days and state different windows.
 * A block of two or more windows that all sit inside the other block's
 * window is a service split (lunch and dinner under "11:00〜22:00") and
 * agrees; a single narrower window is another venue, floor or season.
 */
function blocksDisagree(a: HoursRule[], b: HoursRule[]): boolean {
  const inside = (x: HoursRule, y: HoursRule): boolean =>
    toMin(y.open) <= toMin(x.open) && toMin(x.close) <= toMin(y.close);
  const same = (x: HoursRule, y: HoursRule): boolean => x.open === y.open && x.close === y.close;
  for (const x of a) {
    for (const y of b) {
      if (!overlapDays(x.days, y.days)) continue;
      if (same(x, y)) continue;
      if (inside(x, y) && a.length >= 2 && a.every((z) => b.some((w) => inside(z, w)))) continue;
      if (inside(y, x) && b.length >= 2 && b.every((z) => a.some((w) => inside(z, w)))) continue;
      return true;
    }
  }
  return false;
}

/** Distinct "〇〇店" names on the page; three or more means a store list. */
function storeNameCount(text: string): number {
  const names = new Set<string>();
  const re = /([一-龥ぁ-んァ-ヶA-Za-z0-9ー]{2,10})店(?![舗内長員頭主])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (/^(本|支|各|全|新|旧|当|同|の|この|お|開|閉|来|売|商|飲食|直営|加盟)$/.test(m[1])) continue;
    names.add(m[1]);
    if (names.size >= 6) break;
  }
  return names.size;
}

function readBlock(text: string, labelIndex: number, labelLen: number): { block: Block | null; partial: boolean } {
  const context = text.slice(Math.max(0, labelIndex - 24), labelIndex);
  const frag = windowAfter(text, labelIndex);
  if (OFF_TOPIC_CONTEXT.test(context)) return { block: null, partial: false };
  const ranges = findRanges(frag);
  if (ranges.length === 0) return { block: null, partial: false };
  let partial = UNMODELLED_NOTE.test(frag);
  const rules: HoursRule[] = [];
  let prevEnd = labelLen;
  for (let i = 0; i < ranges.length; i += 1) {
    const r = ranges[i];
    const before = frag.slice(prevEnd, r.index);
    if (OFF_TOPIC_CONTEXT.test(before)) {
      prevEnd = r.index + r.text.length;
      continue;
    }
    // "(土曜日は16:00〜23:00)": a range inside a remark is an exception to
    // the window, not a window of its own.
    const lastOpen = before.lastIndexOf("(");
    if (lastOpen >= 0 && before.indexOf(")", lastOpen) < 0 && !parenIsDayList(before.slice(lastOpen) + ")")) {
      partial = true;
      prevEnd = r.index + r.text.length;
      continue;
    }
    // A sub-label such as 定休日 or ■ ends this block before the range.
    if (i > 0 && SUB_LABEL_CLOSE.test(before)) break;
    const after = frag.slice(r.index + r.text.length, r.index + r.text.length + 16);
    prevEnd = r.index + r.text.length;
    // "[月〜木] 11:00〜16:00 / 17:00〜22:30": a second window with no day
    // words of its own continues the previous one's days.
    let days = parseDays(before) ?? (rules.length > 0 && /^[\s/／・,、]*$/.test(before.replace(/\([^)]*\)/g, "")) ? { days: rules[rules.length - 1].days, unmodelled: false } : null);
    // A day list right after the range, in parentheses, qualifies it:
    // "17:00〜23:00(土・日・月)".
    const trailing = after.match(/^\s*[(（]([^)）]{1,24})[)）]/);
    if (trailing && parenIsDayList(`(${trailing[1]})`)) {
      days = parseDays(trailing[1]);
      prevEnd += trailing[0].length;
    }
    if (days?.unmodelled) partial = true;
    rules.push({ days: days?.days ?? [], open: fmt(r.open), close: fmt(r.close) });
  }
  if (rules.length === 0) return { block: null, partial };
  return {
    block: { rules: dropContained(rules), evidence: frag.slice(0, Math.min(frag.length, prevEnd + 20)).trim() },
    partial,
  };
}

/**
 * Opening hours from normalised page text. Reads the hours labels on the
 * page, parses the time ranges near each, attaches the day words written in
 * the same fragment, and refuses to answer when blocks disagree.
 */
export function extractHours(text: string): HoursResult | null {
  const evidence: string[] = [];
  let partial = false;
  let openEveryDay = false;
  let ambiguous = false;
  const closed = new Set<Weekday>();

  const labelRe = new RegExp(HOURS_LABEL, "g");
  let m: RegExpExecArray | null;
  let seen = 0;
  const blocks: Block[] = [];
  while ((m = labelRe.exec(text)) !== null && seen < 8) {
    seen += 1;
    const { block, partial: p } = readBlock(text, m.index, m[0].length);
    if (p) partial = true;
    if (block) blocks.push(block);
  }

  // Label-less form: "平日 7:00〜23:00 土曜 7:00〜23:00", "月〜木 11:30〜20:00",
  // or "24時間営業". Always scanned; the merge below keeps only windows the
  // labelled blocks did not already state.
  {
    const allDay = text.match(/24\s*時間営業/);
    const legend = allDay && allDay.index !== undefined
      ? /アイコン|提供サービス|絞り込|絞込|条件|設備|サービス一覧|こだわり/.test(text.slice(Math.max(0, allDay.index - 60), allDay.index + 40))
      : true;
    if (allDay && allDay.index !== undefined && !legend && blocks.length === 0) {
      blocks.push({ rules: [{ days: [], open: "00:00", close: "24:00" }], evidence: "24時間営業" });
    } else {
      const dayRange = new RegExp(
        `(平日|週末|土日祝|土日|土曜日?|日曜日?|祝日|祭日|休日|[月火水木金土日](?:曜日?)?\\s*〜\\s*[月火水木金土日](?:曜日?)?)\\s*[:：\\]]?\\s*(${TIME_TOKEN})\\s*〜\\s*(${TIME_TOKEN})`,
        "g",
      );
      const rules: HoursRule[] = [];
      let ev = "";
      while ((m = dayRange.exec(text)) !== null && rules.length < 7) {
        const r = parseRange(m[2], m[3]);
        const days = parseDays(m[1].replace("休日", "日祝"));
        if (!r || !days) continue;
        if (days.days.length === 0) continue;
        const ctx = text.slice(Math.max(0, m.index - 16), m.index);
        if (OFF_TOPIC_CONTEXT.test(ctx)) continue;
        if (ctx.lastIndexOf("(") > ctx.lastIndexOf(")")) continue;
        rules.push({ days: days.days, open: fmt(r.open), close: fmt(r.close) });
        if (!ev) ev = text.slice(m.index, m.index + 80);
      }
      // Only windows the labelled blocks did not already state, and never a
      // contradiction of them (that would be a second venue or a notice).
      const stated = blocks.flatMap((b) => b.rules);
      const fresh = rules.filter((r) => !stated.some((x) => sameDays(x.days, r.days) && x.open === r.open && x.close === r.close));
      if (fresh.length > 0 && !blocksDisagree(stated, fresh)) blocks.push({ rules: dropContained(fresh), evidence: ev.trim() });
    }
  }

  // Merge blocks. Blocks that restate the same hours (header + footer)
  // collapse; blocks that disagree make the page ambiguous. So does a page
  // that lists several stores and states hours more than once.
  let rules: HoursRule[] = [];
  if (blocks.length >= 2 && storeNameCount(text) >= 3) ambiguous = true;
  for (const b of blocks) {
    if (rules.length > 0 && blocksDisagree(rules, b.rules)) {
      ambiguous = true;
    }
    for (const r of b.rules) {
      if (!rules.some((x) => sameDays(x.days, r.days) && x.open === r.open && x.close === r.close)) rules.push(r);
    }
    evidence.push(b.evidence);
  }
  rules = dropContained(rules).filter(
    (r, _, all) => r.days.length > 0 || !all.some((x) => x.days.length > 0 && x.open === r.open && x.close === r.close),
  );

  // 年中無休 / 無休 can stand on its own, without a closed-day label.
  const everyDay = text.match(/年中無休|(?<![はにみ月間、,])無休/);
  if (everyDay && everyDay.index !== undefined && !/期間|中|のみ|月は|シーズン/.test(text.slice(Math.max(0, everyDay.index - 8), everyDay.index))) {
    openEveryDay = true;
    evidence.push(text.slice(Math.max(0, everyDay.index - 6), everyDay.index + everyDay[0].length).trim());
  }

  // Closed days: strong labels first, then the weaker words.
  const closedBlocks: Weekday[][] = [];
  const strongAt = new RegExp(`^${CLOSED_LABEL_STRONG}`);
  for (const label of [CLOSED_LABEL_STRONG, CLOSED_LABEL_WEAK]) {
    const closedRe = new RegExp(label, "g");
    let cseen = 0;
    while ((m = closedRe.exec(text)) !== null && cseen < 6) {
      if (label === CLOSED_LABEL_WEAK && strongAt.test(text.slice(m.index))) continue;
      cseen += 1;
      const frag = windowAfter(text, m.index, 60);
      let after = frag.slice(m[0].length);
      if (/^[\s:：/／]*(?:なし|無し|年中無休|無休)/.test(after)) continue;
      // "(定休日金曜日) 土日祝 11:00〜": the closed days end at the paren or
      // at the first clock time, whichever comes first.
      const stop = after.search(/[)）\[［【]|営業|開館|開園|\d{1,2}(?::\d{2}|時)\s*〜/);
      if (stop >= 0) after = after.slice(0, stop);
      if (/^[\s:：/／]*(?:-|ー|―|無|な)\s*$/.test(after)) continue;
      const cut = after.slice(1).search(SUB_LABEL_CLOSE);
      if (cut >= 0) after = after.slice(0, cut + 1);
      // "定休日 月曜日 07:00〜20:00 火曜日 …" is a per-day hours table under a
      // misleading heading, not a list of closed days.
      if (/^[\s:：／/]*[月火水木金土日祝](?:曜日?)?\s*[:：]?\s*\d{1,2}(?::\d{2}|時)/.test(after)) continue;
      const days = parseDays(after.slice(0, 40));
      if (!days) continue;
      if (days.unmodelled) partial = true;
      if (days.days.length > 0) {
        closedBlocks.push(days.days);
        evidence.push(frag.slice(0, 40).trim());
      }
    }
    if (closedBlocks.length > 0) break;
  }
  // "日曜日・祭日 休業", "月曜 定休": the days come before the closed word.
  if (closedBlocks.length === 0) {
    const beforeRe = /(?<![翌の平一-龥])((?:[月火水木金土日祝祭](?:曜日?)?(?:\s*[・,、/と]\s*)?){1,4})\s*(?:は|:|：)?\s*(?:休業|定休|休み|お休み|休館|休園|休日)/g;
    const scan = text.replace(/祝(?:祭)?日の翌(?:平)?日|翌(?:平)?日/g, "  ");
    let bm: RegExpExecArray | null;
    while ((bm = beforeRe.exec(scan)) !== null && closedBlocks.length < 2) {
      const days = parseDays(bm[1] + "曜");
      if (days && days.days.length > 0) {
        closedBlocks.push(days.days);
        evidence.push(bm[0].trim());
      }
    }
  }
  if (closedBlocks.length > 1 && closedBlocks.some((b) => !sameDays(b, closedBlocks[0]))) {
    // Different closed days in different places: several venues, or a
    // notice. Keep the days all blocks agree on, flag the rest.
    const common = closedBlocks[0].filter((d) => closedBlocks.every((b) => b.includes(d)));
    for (const d of common) closed.add(d);
    partial = true;
    if (common.length === 0) ambiguous = true;
  } else if (closedBlocks.length > 0) {
    for (const d of closedBlocks[0]) closed.add(d);
  }

  if (rules.length === 0 && closed.size === 0 && !openEveryDay) return null;
  // "年中無休" next to stated closed days belongs to another facility on the
  // page; the closed days win and the record is marked partial.
  if (openEveryDay && closed.size > 0) {
    openEveryDay = false;
    partial = true;
  }

  // In OSM syntax a later "We off" overrides the Wednesday of "Mo-Fr", so
  // the day sets are written as the page gave them.
  const closedDays = ORDER.filter((d) => closed.has(d));

  // A past-midnight close is written as a clock time ("18:00-02:00"); the
  // server parser re-encodes it. "24:00" itself is the OSM end-of-day.
  const clock = (hhmm: string): string => {
    const [h, mm] = hhmm.split(":").map((x) => parseInt(x, 10));
    if (h < 24 || (h === 24 && mm === 0)) return hhmm;
    return `${String(h - 24).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  };
  const osmParts: string[] = [];
  if (!ambiguous) {
    for (const r of rules) {
      const days = r.days.length > 0 ? daysToOsm(r.days) : "";
      const span = `${r.open}-${clock(r.close)}`;
      osmParts.push(days ? `${days} ${span}` : span);
    }
    for (const d of closedDays) osmParts.push(`${d} off`);
    if (closed.has("PH")) osmParts.push("PH off");
  }

  return {
    opening_hours: osmParts.length > 0 ? osmParts.join("; ") : null,
    rules,
    closed_days: closedDays.concat(closed.has("PH") ? ["PH"] : []),
    open_every_day: openEveryDay,
    partial,
    ambiguous,
    evidence: dedupe(evidence),
  };
}

// ──────────────────────────────────────────────────────────────────────
// Prices

const PRICE_LABEL =
  "(?:入場料|入館料|入園料|拝観料|観覧料|見学料|参拝料|利用料金|利用料|入場料金|入館料金|料金|参加費|乗船料|入浴料|入湯料)";
const LODGING_PRICE_LABEL = "(?:宿泊料金|宿泊料|宿泊費|1泊|一泊|お一人様|1名様|おひとり様|室料)";
const YEN = "(\\d{1,3}(?:,\\d{3})+|\\d{1,6})\\s*円";
const ADULT = "(?:大\\s*人|一\\s*般|おとな|成人|中学生以上|高校生以上)";
const CHILD = "(?:小\\s*人|こども|子供|子ども|小学生|児童|小中学生)";
const PRICE_OFF_TOPIC = /駐車|パーキング|キャンセル|タオル|レンタル|貸出|送迎|シャトル|WiFi|Wi-Fi|改定|変更|延長|追加|深夜|割増|税/;

function yen(s: string): number {
  return parseInt(s.replace(/,/g, ""), 10);
}

export function extractPrice(text: string, lodging = false): PriceResult | null {
  const evidence: string[] = [];
  let adult: number | null = null;
  let child: number | null = null;
  let from: number | null = null;
  let free = false;

  if (lodging) {
    // A hotel page's "料金" is anything from parking to a towel. Only an
    // amount next to a lodging word is a room rate, and only as a "from".
    const re = new RegExp(`${LODGING_PRICE_LABEL}[^\\n円]{0,30}?${YEN}`, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const before = text.slice(Math.max(0, m.index - 20), m.index);
      // "宿泊費別", "1泊1台 乗用車1,200円": not a room rate.
      if (/^(?:宿泊料金|宿泊料|宿泊費)(?:は)?(?:別|除|含)/.test(m[0]) || /台|乗用車|駐車|車/.test(m[0])) continue;
      const afterAmount = text.slice(m.index + m[0].length, m.index + m[0].length + 8);
      if (/スタンプ|ポイント|貯ま|進呈|クーポン|割引|引き|OFF|還元|キャンペーン|分/.test(m[0] + afterAmount)) continue;
      if (PRICE_OFF_TOPIC.test(before) || PRICE_OFF_TOPIC.test(m[0])) continue;
      const v = yen(m[1]);
      if (v < 2500 || v > 500000) continue;
      if (from === null || v < from) from = v;
      evidence.push(m[0]);
      if (evidence.length >= 3) break;
    }
    if (from === null) return null;
    return { adult_jpy: null, child_jpy: null, free: false, from_jpy: from, evidence: dedupe(evidence) };
  }

  const labelRe = new RegExp(PRICE_LABEL, "g");
  let m: RegExpExecArray | null;
  let seen = 0;
  while ((m = labelRe.exec(text)) !== null && seen < 6) {
    seen += 1;
    const before = text.slice(Math.max(0, m.index - 16), m.index);
    if (PRICE_OFF_TOPIC.test(before)) continue;
    const frag = windowAfter(text, m.index, 160);
    const a = frag.match(new RegExp(`${ADULT}[^\\d円]{0,12}${YEN}`));
    const c = frag.match(new RegExp(`${CHILD}[^\\d円]{0,12}${YEN}`));
    const freeAt = frag.search(/無料/);
    const amountAt = frag.search(/\d\s*円/);
    if (
      !a &&
      !c &&
      freeAt >= 0 &&
      freeAt <= 24 &&
      (amountAt < 0 || amountAt > freeAt) &&
      adult === null &&
      !/無料(?:駐車|Wi|WI|wi|送迎|貸出|レンタル|には|では|になりません|ではありません)/.test(frag)
    ) {
      free = true;
      evidence.push(frag.slice(0, 30).trim());
      continue;
    }
    if (a && adult === null) {
      adult = yen(a[1]);
      evidence.push(a[0]);
    }
    if (c && child === null) {
      child = yen(c[1]);
      evidence.push(c[0]);
    }
    if (!a && !c) {
      // A bare amount right after the label: "入場料 500円", "拝観料 1,000円"
      const bare = frag.match(new RegExp(`^${PRICE_LABEL}[^円\\n]{0,24}?${YEN}(〜|から|より)?`));
      if (bare && !PRICE_OFF_TOPIC.test(bare[0])) {
        if (bare[2]) {
          if (from === null) from = yen(bare[1]);
        } else if (adult === null) {
          adult = yen(bare[1]);
        }
        evidence.push(bare[0]);
      }
    }
  }
  if (adult !== null || child !== null) free = false;
  if (adult === null && child === null && from === null && !free) return null;
  return { adult_jpy: adult, child_jpy: child, free, from_jpy: from, evidence: dedupe(evidence) };
}

// ──────────────────────────────────────────────────────────────────────
// Lodging check-in / check-out

export function extractLodgingTimes(text: string): LodgingTimes | null {
  const inRe = /(チェックイン|Check[- ]?in|C\/I|\bIN)\s*[:：]?\s*((?:午前|午後)?\s*\d{1,2}(?::\d{2}|時(?:\s*\d{1,2}\s*分?|半)?))/i;
  const outRe = /(チェックアウト|Check[- ]?out|C\/O|\bOUT)\s*[:：]?\s*((?:午前|午後)?\s*\d{1,2}(?::\d{2}|時(?:\s*\d{1,2}\s*分?|半)?))/i;
  // "レイトチェックアウト 15:00" and "アーリーチェックイン 12:00" are options,
  // not the standard times; read the first plain mention instead.
  const plain = text.replace(/(レイト|アーリー|late|early|Late|Early)\s*(チェック(?:イン|アウト)|Check[- ]?(?:in|out))/g, "$1 ");
  const i = plain.match(inRe);
  const o = plain.match(outRe);
  if (!i && !o) return null;
  const evidence: string[] = [];
  let checkin: string | null = null;
  let checkout: string | null = null;
  if (i) {
    const t = parseJaTime(i[2]);
    if (t !== null && t >= 10 * 60 && t <= 24 * 60) {
      checkin = fmt(t);
      evidence.push(i[0]);
    }
  }
  if (o) {
    const t = parseJaTime(o[2]);
    // A bare "OUT" is read only for a morning time; the word alone is weak.
    const bare = /^out$/i.test(o[1]);
    const max = bare ? 12 * 60 : 13 * 60;
    if (t !== null && t >= 5 * 60 && t <= max) {
      checkout = fmt(t);
      evidence.push(o[0]);
    }
  }
  if (!checkin && !checkout) return null;
  return { checkin, checkout, evidence };
}

// ──────────────────────────────────────────────────────────────────────
// Closure notice

const CLOSURE_RE =
  /(閉店のお知らせ|閉店いたしました|閉店致しました|閉店しました|閉業のお知らせ|閉業いたしました|廃業のお知らせ|営業を終了いたしました|営業を終了しました|閉館のお知らせ|閉館いたしました)/;

/** The page announces that the venue has closed for good. */
export function extractClosureNotice(text: string): string | null {
  const m = text.match(CLOSURE_RE);
  if (!m || m.index === undefined) return null;
  return text.slice(Math.max(0, m.index - 20), m.index + m[0].length + 20).replace(/\s+/g, " ").trim();
}

// ──────────────────────────────────────────────────────────────────────

function dedupe(xs: string[]): string[] {
  return [...new Set(xs.map((x) => x.replace(/\s+/g, " ").trim()).filter(Boolean))];
}

/**
 * All facts the rules can read from one page's visible text.
 * `lodging` switches to room rates and check-in/out; a hotel page's hours
 * labels belong to its restaurant, bath or front desk and are not read.
 */
export function extractPageFacts(rawText: string, lodging = false): PageFacts {
  const text = normalizeJa(rawText);
  return {
    hours: lodging ? null : extractHours(text),
    price: extractPrice(text, lodging),
    lodging: lodging ? extractLodgingTimes(text) : null,
    closure_notice: extractClosureNotice(text),
  };
}

/**
 * The part of the page a later model pass should read: a bounded window
 * around the first hours or price label, or the start of the text when no
 * label exists. Keeps model input small and on topic.
 */
export function factsSnippet(rawText: string, maxChars = 1800): string {
  const text = normalizeJa(rawText);
  const re = new RegExp(`${HOURS_LABEL}|${CLOSED_LABEL_STRONG}|${PRICE_LABEL}|チェックイン`);
  const m = text.match(re);
  if (!m || m.index === undefined) return text.slice(0, maxChars);
  const start = Math.max(0, m.index - 200);
  return text.slice(start, start + maxChars);
}
