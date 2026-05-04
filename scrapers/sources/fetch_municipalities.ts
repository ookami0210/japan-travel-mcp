/**
 * Fetch the official municipality code list from the Ministry of Internal Affairs
 * and Communications (総務省) and save as JSON.
 *
 * Source: https://www.soumu.go.jp/denshijiti/code.html
 *
 * Output: data/_state/municipalities.json
 *   {
 *     prefectures: [{ code, name, name_kana }, ...]    // 47
 *     municipalities: [{ code, prefecture_code, prefecture_name, name, name_kana }, ...]  // ~1,741
 *   }
 */

import * as XLSX from "xlsx";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SOUMU_URL = "https://www.soumu.go.jp/main_content/000925835.xlsx";

const OUTPUT_PATH = new URL("../../data/_state/municipalities.json", import.meta.url);

export interface PrefectureRecord {
  code: string; // 2-digit
  name: string;
  name_kana: string;
}

export interface MunicipalityRecord {
  code: string; // 5 or 6 digit
  prefecture_code: string;
  prefecture_name: string;
  name: string;
  name_kana: string;
}

async function main(): Promise<void> {
  console.error(`[fetch_municipalities] GET ${SOUMU_URL}`);
  const res = await fetch(SOUMU_URL);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  console.error(`[fetch_municipalities] downloaded ${buf.length} bytes`);

  const wb = XLSX.read(buf, { type: "buffer" });
  console.error(`[fetch_municipalities] sheets: ${wb.SheetNames.join(", ")}`);

  const prefectures: PrefectureRecord[] = [];
  const municipalities: MunicipalityRecord[] = [];

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: "",
      raw: false,
    });

    for (const row of rows) {
      if (!Array.isArray(row) || row.length < 3) continue;
      const codeRaw = String(row[0] ?? "").trim();
      const a = String(row[1] ?? "").trim();
      const b = String(row[2] ?? "").trim();
      const c = String(row[3] ?? "").trim();
      const d = String(row[4] ?? "").trim();

      if (!/^\d{5,6}$/.test(codeRaw)) continue;

      const prefCode = codeRaw.slice(0, 2);

      // Two common layouts:
      //   [code, prefName, muniName, prefKana, muniKana]
      //   [code, prefName, muniName] (no kana)
      // Prefecture-only row: muniName empty.
      const prefName = a;
      const muniName = b;
      const prefKana = c;
      const muniKana = d;

      if (!muniName) {
        // Prefecture row (no municipality name)
        if (!prefectures.some((p) => p.code === prefCode)) {
          prefectures.push({
            code: prefCode,
            name: prefName,
            name_kana: prefKana,
          });
        }
        continue;
      }

      municipalities.push({
        code: codeRaw,
        prefecture_code: prefCode,
        prefecture_name: prefName,
        name: muniName,
        name_kana: muniKana,
      });
    }
  }

  console.error(
    `[fetch_municipalities] parsed: ${prefectures.length} prefectures, ${municipalities.length} municipalities`,
  );

  if (prefectures.length !== 47) {
    console.error(
      `[fetch_municipalities] WARNING: expected 47 prefectures, got ${prefectures.length}`,
    );
  }
  if (municipalities.length < 1700 || municipalities.length > 1800) {
    console.error(
      `[fetch_municipalities] WARNING: municipality count ${municipalities.length} is outside expected ~1,741 range`,
    );
  }

  // Sort by code
  prefectures.sort((a, b) => a.code.localeCompare(b.code));
  municipalities.sort((a, b) => a.code.localeCompare(b.code));

  const output = {
    source: {
      url: SOUMU_URL,
      publisher: "総務省 (Ministry of Internal Affairs and Communications)",
      title: "全国地方公共団体コード",
    },
    fetched_at: new Date().toISOString(),
    prefecture_count: prefectures.length,
    municipality_count: municipalities.length,
    prefectures,
    municipalities,
  };

  const outPath = fileURLToPath(OUTPUT_PATH);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(output, null, 2), "utf8");
  console.error(`[fetch_municipalities] saved → ${outPath}`);
}

main().catch((err) => {
  console.error("[fetch_municipalities] FAILED:", err);
  process.exit(1);
});
