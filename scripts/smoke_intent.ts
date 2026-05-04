#!/usr/bin/env -S node --loader tsx/esm
/**
 * Quick smoke test for src/lib/intent.ts dictionary. Prints (id, matched_text,
 * recommended_kinds, recommended_heritage_qids, suggested_tool) per query.
 *
 * Usage:  npx tsx scripts/smoke_intent.ts
 */
import { extractTravelIntent } from "../src/lib/intent.js";

const QUERIES = [
  "高野山の宿坊に泊まりたい",
  "古民家ステイができる町",
  "擬洋風建築が見られる町",
  "横丁で居酒屋巡り",
  "城下町の街並み",
  "東海道の宿場町",
  "武家屋敷が残るエリア",
  "四国八十八ヶ所の遍路",
  "出羽三山の修験道",
  "隠れキリシタン関連遺産",
  "棚田の絶景",
  "鳥取砂丘",
  "夜景がきれいな展望台",
  "北海道のホエールウォッチング",
  "浮世絵を所蔵する美術館",
  "縄文遺跡を見学",
  "アイヌ文化に触れる",
  "琉球王国のグスク",
  "夏祭り 祇園",
  "夏の花火大会",
  "札幌の雪まつり",
  "秘湯",
  "明治の産業遺産 軍艦島",
  "石見銀山 鉱山遺跡",
  "伝統工芸の窯元",
  "陶磁器のやきもの体験",
  "ご当地の郷土料理",
  "国立公園でハイキング",
  "国定公園",
  "廃線跡を歩く",
  "デパ地下グルメ",
  "Mt Koya temple lodging",
  "rice terrace landscape",
  "Tokaido post town",
  "hidden Christian heritage Nagasaki",
  "ukiyo-e museum Tokyo",
];

console.log("Travel Concept Dictionary smoke test\n");
let totalMatched = 0;
for (const q of QUERIES) {
  const r = extractTravelIntent(q);
  if (r.concepts.length === 0) {
    console.log(`[ NO MATCH ] ${q}`);
    continue;
  }
  totalMatched++;
  const ids = r.concepts.map((c) => c.id).join(", ");
  const kinds = Array.from(r.recommended_kinds).join(", ");
  const qids = Array.from(r.recommended_heritage_qids).join(", ");
  const tool = r.preferred_tool ?? "-";
  console.log(`[OK] ${q}`);
  console.log(`     concepts=${ids}`);
  if (kinds) console.log(`     kinds=${kinds}`);
  if (qids) console.log(`     heritage=${qids}`);
  if (tool !== "-") console.log(`     suggested_tool=${tool}`);
}
console.log(`\n${totalMatched}/${QUERIES.length} queries matched.`);
