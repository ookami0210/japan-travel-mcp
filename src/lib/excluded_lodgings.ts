/**
 * Rows the campground layer must not contain.
 *
 * Two separate problems, found by auditing the 2,163 rows that classify as
 * campgrounds and reading what OpenStreetMap actually says about each.
 *
 * 1. The 2011 emergency-shelter import. After the Tōhoku earthquake,
 *    prefectural shelter lists were mapped into OSM as `tourism=camp_site`
 *    carrying `temporary=yes` and `refugee=<headcount>`, with
 *    `source=Iwate pref` and the like. They are schools, gymnasiums,
 *    community centres and unnamed assembly points — 74 of them, and not one
 *    has a campground-like name. They were never campgrounds and are not
 *    accommodations at all, so they leave the dataset.
 *
 * 2. Bare duplicate nodes. 12 rows carry no name, no website, no phone and
 *    no facility tag, and sit within 50 m of a named campground — the same
 *    site mapped twice. The named row keeps everything; the bare one adds
 *    nothing. A bare node that does carry a facility tag is left alone,
 *    because deleting it would lose the tag.
 *
 * Deliberately NOT deleted: a row that is a real accommodation wearing the
 * wrong label. Two of the shelter-tagged rows are a hotel and a welfare
 * centre with lodging and a live website; deleting them would lose a real
 * place, so they are reclassified instead (see LODGING_TYPE_OVERRIDES).
 *
 * Also deliberately left alone: rows whose names differ at the same spot
 * (two areas of one park, a bungalow field beside a tent field), and
 * Japanese/English pairs the matcher failed to merge. Those are a matching
 * problem, not a deletion problem — deleting either side would lose a name.
 *
 * Applied in three places so the dataset is consistent whether or not the
 * master has been regenerated: the matcher drops them when it writes the
 * master, the server drops them when it loads it, and the campground passes
 * skip them so no derived layer re-adds them.
 */

/** id → why it is gone, kept as prose so the list stays auditable. */
export const DELETED_LODGINGS: ReadonlyMap<string, string> = new Map([
  // 2011 emergency-shelter import (74)
  ["b39095fa1910", "unnamed shelter point / pref 03"],
  ["52597e1197a6", "unnamed shelter point / pref 03"],
  ["91c1416609d0", "unnamed shelter point / pref 03"],
  ["fb9812f6a5c2", "unnamed shelter point / pref 03"],
  ["209600f88524", "unnamed shelter point / pref 03"],
  ["775a40374461", "unnamed shelter point / pref 03"],
  ["3dbd89171a14", "unnamed shelter point / pref 03"],
  ["cc2a37ae7998", "unnamed shelter point / pref 03"],
  ["18f4c93f2fee", "あかね会（ケアプラザ大槌） / pref 03"],
  ["c48ac67b853e", "なはんプラザ / pref 03"],
  ["ffab442abf23", "はまゆり学園 / pref 03"],
  ["ba347bb17ca9", "上之坊公民館 / pref 03"],
  ["ed2ae6affc53", "佐々木宅 / pref 03"],
  ["4abf20b6d3b8", "北里大学（水産学部） / pref 03"],
  ["a7f5ca3b3b76", "千歳部落公民館 / pref 03"],
  ["47d7245402fc", "和方会館 / pref 03"],
  ["018a4851b136", "城山公園体育館 / pref 03"],
  ["d4e1acd0e4f1", "夏虫のお湯っこ / pref 03"],
  ["eb580597382c", "大槌勤労青少年体育センター / pref 03"],
  ["4f43303a2137", "大槌町役場 金沢支所 / pref 03"],
  ["01a5b17fab47", "宮古市立宮古西中学校 / pref 03"],
  ["355f54ef7076", "宮古市立山口小学校 / pref 03"],
  ["e83401112c57", "宮古市立河南中学校 / pref 03"],
  ["07f3849e0d62", "宮古市立磯鶏小学校 / pref 03"],
  ["f5de89131f8b", "宮古市立藤原小学校 / pref 03"],
  ["7165eed3d1ea", "宮古消防署 / pref 03"],
  ["c61d4738dda9", "山田町立豊間根中学校 / pref 03"],
  ["26ff28def0bb", "山田町立豊間根保育園 / pref 03"],
  ["3b2f828f1213", "山田町立豊間根小学校 / pref 03"],
  ["88ea31aaf520", "岩手県久慈市立平山小学校 / pref 03"],
  ["4689297b2d56", "岩手県洋野町立八木保育園 / pref 03"],
  ["7c4fdfa03305", "岩手県洋野町立宿戸保育園 / pref 03"],
  ["5a134163ad91", "岩手県洋野町立平内小学校 / pref 03"],
  ["699f46b8d1e2", "市立津軽石中学校 / pref 03"],
  ["8c63deb2f2ea", "志和公民館 / pref 03"],
  ["e8e765bb096f", "旧自然休暇村 / pref 03"],
  ["b4463efc77b0", "松峰公民館 / pref 03"],
  ["746a1fbb4aba", "桜木町保険福祉会館 / pref 03"],
  ["3f983e17141b", "樫内地区集会施設 / pref 03"],
  ["fe1852cc520b", "水沢公民館 / pref 03"],
  ["c046e7bb582f", "江刺総合支所 / pref 03"],
  ["b7574b41b554", "盛岡市西部公民館 / pref 03"],
  ["1db46e7766e8", "県立宮古北高等学校 / pref 03"],
  ["a25d9063dbfd", "矢作公民館多目的研修センター / pref 03"],
  ["3aeef57380cb", "神田地区集会施設 / pref 03"],
  ["588f632de597", "臼澤鹿子踊保存会館伝承館 / pref 03"],
  ["04ce566d35fe", "遊・・亭夏虫 / pref 03"],
  ["a432e0e7c10b", "金沢地区生活改善センター / pref 03"],
  ["d94957a5da73", "釜石市立尾崎小学校 / pref 03"],
  ["1f42efec421d", "釜石市立栗林小学校 / pref 03"],
  ["7d2029ad75d9", "陸前高田自動車学校 / pref 03"],
  ["5f8c6bd10ebe", "雷神自治会館 / pref 03"],
  ["91a1b948cceb", "unnamed shelter point / pref 04"],
  ["f02b17887f00", "unnamed shelter point / pref 04"],
  ["84d3577a3787", "塚浜小屋取集会所 / pref 04"],
  ["d295db742742", "平成の森 / pref 04"],
  ["ecb0086a3ac3", "米沢市営体育館 / pref 06"],
  ["75cdb08ff4af", "上山市体育文化センター / pref 06"],
  ["767aee5e1f21", "南陽市立中川小学校 / pref 06"],
  ["4f1a10db97c0", "寒河江市体育館合宿所 / pref 06"],
  ["1aeb53214975", "小国町立小玉川中学校 / pref 06"],
  ["822e2eb2a3cd", "小国町立玉川小学校 / pref 06"],
  ["d085bdba63db", "山形県中山町勤労文化センター / pref 06"],
  ["91da988b2f2d", "河北町溝延研修センター / pref 06"],
  ["8e4f4111d7db", "unnamed shelter point / pref 07"],
  ["f0f66a3357e3", "unnamed shelter point / pref 08"],
  ["07e08ba2663c", "unnamed shelter point / pref 08"],
  ["06bdddfba6ab", "ひたちなか市総合福祉センター / pref 08"],
  ["3568344859b6", "北茨城市立中妻小学校 / pref 08"],
  ["b83c22391020", "城里町立小松小学校 / pref 08"],
  ["c9f26f610cb2", "城里町立石塚小学校 / pref 08"],
  ["a5b192c162b8", "山吹体育館 / pref 08"],
  ["eeaa103a6fa1", "茨城県立高萩工業高校 / pref 08"],
  ["25987338171c", "行方市立北浦中学校 / pref 08"],
  // Bare duplicate nodes beside a named campground (12)
  ["a08579145674", "bare node beside 春光台公園グリーンスポーツキャンプ場 (46 m)"],
  ["d64edc549b6a", "bare node beside Ayukawaenchi Camping (10 m)"],
  ["6c2a58c5632c", "bare node beside 市立津軽石中学校 (50 m)"],
  ["64e5f62f216a", "bare node beside バンガロー村・古里とみやま (1 m)"],
  ["cd45db050398", "bare node beside したらの里 (1 m)"],
  ["a14a396cd3f4", "bare node beside おくとろ公園キャンプ場 (5 m)"],
  ["dce550601b35", "bare node beside チロリン村 (44 m)"],
  ["40ebed57d1cf", "bare node beside 四尾連湖 水明荘 キャンプ場 (12 m)"],
  ["4895a87cf635", "bare node beside 瀬戸田サンセットビーチ (18 m)"],
  ["c050817721b7", "bare node beside 猿倉山森林公園キャンプ場 (9 m)"],
  ["34b4bd275592", "bare node beside ふれあいパーク大原湖 (30 m)"],
  ["522860205f27", "bare node beside 神洞ほたるの里公園 (11 m)"],
]);

/**
 * A real accommodation that OSM labelled `camp_site` because it served as a
 * 2011 shelter. The row stays; the type is corrected so it stops appearing
 * among campgrounds.
 */
export const LODGING_TYPE_OVERRIDES: ReadonlyMap<string, { type: string; was: string }> = new Map([
  ["179ec251dd73", { type: "hotel", was: "ホテルシーガリアマリン" }],
  ["4cb77f426869", { type: "hotel", was: "ふれあいランド" }],
]);

export function isDeletedLodging(id: string): boolean {
  return DELETED_LODGINGS.has(id);
}

export function lodgingTypeOverride(id: string): string | null {
  return LODGING_TYPE_OVERRIDES.get(id)?.type ?? null;
}
