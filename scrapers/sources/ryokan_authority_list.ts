/**
 * Ryokan-gyo (Hotel Business Act, 旅館業法) permit authorities.
 *
 * Lodging permits in Japan are issued by exactly three classes of bodies
 * (旅館業法 §3, 地域保健法 §5 / 施行令 §1):
 *
 *   1. Prefectural governors ................................. 47
 *   2. Mayors of public-health-center cities (保健所設置市) ... 87
 *      = designated cities 20 + core cities 62 + individually
 *        designated cities 5 (小樽・町田・藤沢・茅ヶ崎・四日市)
 *   3. Heads of Tokyo special wards (特別区) .................. 23
 *
 * Total: 157 authorities. Any nationwide permit-facility ledger must be
 * assembled per-authority — a prefecture's list EXCLUDES facilities inside
 * its public-health-center cities, so prefecture files alone are never
 * complete coverage.
 *
 * City designations verified 2026-08-16: core cities = 62 (last addition
 * Ichinomiya, 2021-04); individually designated public-health-center
 * cities = 5 per 地域保健法施行令 §1.
 *
 * Municipality codes come from data/_state/municipalities.json
 * (総務省 code list — run `npm run fetch:municipalities` if missing).
 */

import { readFile } from "node:fs/promises";

const MUNICIPALITIES_PATH = new URL(
  "../../data/_state/municipalities.json",
  import.meta.url,
);

export type AuthorityKind =
  | "prefecture"
  | "designated_city" // 政令指定都市
  | "core_city" // 中核市
  | "phc_city" // 保健所設置市 (individually designated, 施行令 §1-3)
  | "special_ward"; // 東京都特別区

export interface Authority {
  /** Stable key: "pref-13" | "muni-131016" style. */
  key: string;
  name: string;
  kind: AuthorityKind;
  prefecture_code: string;
  prefecture_name: string;
  /** 6-digit 総務省 code with check digit; null for prefectures. */
  municipality_code: string | null;
}

const DESIGNATED_CITIES = [
  "札幌市", "仙台市", "さいたま市", "千葉市", "横浜市", "川崎市", "相模原市",
  "新潟市", "静岡市", "浜松市", "名古屋市", "京都市", "大阪市", "堺市",
  "神戸市", "岡山市", "広島市", "北九州市", "福岡市", "熊本市",
];

const CORE_CITIES = [
  // Hokkaido / Tohoku
  "旭川市", "函館市", "青森市", "八戸市", "盛岡市", "秋田市", "山形市",
  "郡山市", "いわき市", "福島市",
  // Kanto
  "水戸市", "宇都宮市", "前橋市", "高崎市", "川越市", "越谷市", "川口市",
  "船橋市", "柏市", "八王子市", "横須賀市",
  // Chubu
  "富山市", "金沢市", "福井市", "甲府市", "長野市", "松本市", "岐阜市",
  "豊田市", "豊橋市", "岡崎市", "一宮市",
  // Kinki
  "大津市", "高槻市", "東大阪市", "豊中市", "枚方市", "八尾市", "寝屋川市",
  "吹田市", "姫路市", "西宮市", "尼崎市", "明石市", "奈良市", "和歌山市",
  // Chugoku / Shikoku
  "鳥取市", "松江市", "倉敷市", "福山市", "呉市", "下関市",
  "高松市", "松山市", "高知市",
  // Kyushu / Okinawa
  "久留米市", "長崎市", "佐世保市", "大分市", "宮崎市", "鹿児島市", "那覇市",
];

/** Individually designated public-health-center cities (地域保健法施行令 §1-3). */
const PHC_CITIES = ["小樽市", "町田市", "藤沢市", "茅ヶ崎市", "四日市市"];

interface MunicipalityRecord {
  code: string;
  prefecture_code: string;
  prefecture_name: string;
  name: string;
  name_kana: string;
}

interface MunicipalitiesFile {
  prefectures: { code: string; name: string; name_kana: string }[];
  municipalities: MunicipalityRecord[];
}

export async function loadAuthorities(): Promise<Authority[]> {
  const raw = JSON.parse(
    await readFile(MUNICIPALITIES_PATH, "utf8"),
  ) as MunicipalitiesFile;

  // The 総務省 sheet import contains duplicate rows — dedupe by code.
  const byCode = new Map<string, MunicipalityRecord>();
  for (const m of raw.municipalities) {
    if (!byCode.has(m.code)) byCode.set(m.code, m);
  }
  const munis = [...byCode.values()];

  const cityByName = (name: string): MunicipalityRecord => {
    const hits = munis.filter((m) => m.name === name);
    if (hits.length !== 1) {
      throw new Error(
        `municipality lookup for "${name}" returned ${hits.length} records — ` +
          `the designation lists in ryokan_authority_list.ts need a prefecture qualifier`,
      );
    }
    return hits[0];
  };

  const authorities: Authority[] = [];

  for (const p of raw.prefectures) {
    authorities.push({
      key: `pref-${p.code}`,
      name: p.name,
      kind: "prefecture",
      prefecture_code: p.code,
      prefecture_name: p.name,
      municipality_code: null,
    });
  }

  const pushCities = (names: string[], kind: AuthorityKind): void => {
    for (const name of names) {
      const m = cityByName(name);
      authorities.push({
        key: `muni-${m.code}`,
        name: m.name,
        kind,
        prefecture_code: m.prefecture_code,
        prefecture_name: m.prefecture_name,
        municipality_code: m.code,
      });
    }
  };

  pushCities(DESIGNATED_CITIES, "designated_city");
  pushCities(CORE_CITIES, "core_city");
  pushCities(PHC_CITIES, "phc_city");

  // Tokyo special wards: codes 13101x–13123x.
  const wards = munis
    .filter((m) => m.prefecture_code === "13" && /^131/.test(m.code))
    .sort((a, b) => a.code.localeCompare(b.code));
  for (const w of wards) {
    authorities.push({
      key: `muni-${w.code}`,
      name: w.name,
      kind: "special_ward",
      prefecture_code: w.prefecture_code,
      prefecture_name: w.prefecture_name,
      municipality_code: w.code,
    });
  }

  const expected = { prefecture: 47, designated_city: 20, core_city: 62, phc_city: 5, special_ward: 23 };
  const counts: Record<string, number> = {};
  for (const a of authorities) counts[a.kind] = (counts[a.kind] ?? 0) + 1;
  for (const [kind, n] of Object.entries(expected)) {
    if (counts[kind] !== n) {
      throw new Error(
        `authority count mismatch for ${kind}: got ${counts[kind]}, expected ${n}`,
      );
    }
  }
  if (authorities.length !== 157) {
    throw new Error(`expected 157 authorities, got ${authorities.length}`);
  }
  return authorities;
}
