# Japan Travel MCP — Quality Test Cases (100)

> Test corpus for verifying the MCP server's coverage, multilingual quality,
> and ability to handle abstract / cultural exploration queries.
>
> Maintained by KJ Sunada. To run: feed each `query` to the MCP server in the
> specified `language` and verify against `pass_criteria`.

---

## How to read this file

Each test case has:

- **ID** — stable identifier (`L{level}-{number}`)
- **Level** — abstraction level
  - **L1**: Pinpoint by proper noun (1 entity, named directly)
  - **L2**: Genre + region (a category within a geography)
  - **L3**: Experience-based abstract ("I want to see X", no place named)
  - **L4**: Cultural exploration (lesser-known, taste-driven, requires curation)
- **Language** — ISO 639-1 code
- **Query** — the actual prompt sent to the MCP server (in the target language)
- **Expected topic** — what a correct response should be about
- **Pass criteria** — what makes the response acceptable

---

## L1 — Pinpoint by proper noun (20 cases)

Verify that named entities are findable across the dataset. The bar is binary:
the right entity comes back with substantive content, or it doesn't.

| ID | Lang | Query | Expected topic | Pass criteria |
|----|------|-------|----------------|---------------|
| L1-01 | en | Tell me about Tajima beef from Hyogo, the origin of Kobe beef. | 但馬牛 | Mentions Hyogo, lineage to Kobe/Matsusaka, traceability registry |
| L1-02 | ar | أخبرني عن لحم تاجيما في محافظة هيوغو، أصل لحم كوبي. | 但馬牛 | Same as L1-01, in Arabic, RTL rendering correct |
| L1-03 | en | Describe the tea fields of Minami-Yamashiro village in Kyoto. Just the village, not Uji. | 南山城村 茶畑 | Mentions Minami-Yamashiro specifically, distinguishes from Uji |
| L1-04 | es | Háblame del Yoshida no Hi-Matsuri al pie del Monte Fuji. | 吉田の火祭り | Mentions Fujiyoshida, fire torches, Aug 26-27 timing |
| L1-05 | ja | 中芸地域の柚子について教えて | 中芸地域ゆず | 高知県中芸広域、安田町・馬路村等の特定 |
| L1-06 | zh | 介绍一下青森县的弘前公园樱花。 | 弘前公園 桜 | 弘前公園、约2,600本、ソメイヨシノ含む |
| L1-07 | ko | 이즈모다이샤 이즈모 타이샤에 대해 알려주세요. | 出雲大社 | 縁結びの神、大国主命、神在月 |
| L1-08 | fr | Parle-moi du sanctuaire d'Itsukushima à Hiroshima. | 厳島神社 | UNESCO, 鳥居 in water, 宮島 |
| L1-09 | de | Erzähl mir vom Kumano Kodo Pilgerweg. | 熊野古道 | UNESCO, 三重・和歌山, ナカヘチ・コヒジ路 |
| L1-10 | ru | Расскажи о замке Химэдзи. | 姫路城 | UNESCO, 白鷺城, 江戸初期木造 |
| L1-11 | th | ขอข้อมูลเกี่ยวกับการแสดงบุนรากุที่โอซาก้า | 文楽 | 国立文楽劇場、人形浄瑠璃、無形文化遺産 |
| L1-12 | vi | Hãy cho tôi biết về Yumihama Kasuri ở tỉnh Tottori. | 弓浜絣 | 鳥取県、伝統工芸、藍染、絣織 |
| L1-13 | tl | Sabihin mo sa akin ang tungkol sa Naoshima Art Island. | 直島 | 香川県、ベネッセ・アートサイト、地中美術館 |
| L1-14 | en | What is the Kakunodate samurai district in Akita? | 角館 武家屋敷 | 仙北市、しだれ桜、武家町 |
| L1-15 | id | Beritahu saya tentang Onomichi di Hiroshima. | 尾道 | 広島県、坂の街、しまなみ海道起点 |
| L1-16 | es | ¿Qué es Nachi Falls en Wakayama? | 那智の滝 | 熊野那智大社、133m、日本三名瀑 |
| L1-17 | hi | मुझे होक्काइदो में शिरेतोको प्रायद्वीप के बारे में बताइए। | 知床半島 | UNESCO自然遺産、流氷、ヒグマ |
| L1-18 | en | Tell me about Dewa Sanzan in Yamagata. | 出羽三山 | 月山・羽黒山・湯殿山、修験道 |
| L1-19 | pt | Fale-me sobre a ilha de Yakushima. | 屋久島 | UNESCO、縄文杉、千年杉 |
| L1-20 | ko | 사도섬에 대해 알려주세요. | 佐渡島 | 新潟県、金山遺産、トキ、たらい舟 |

---

## L2 — Genre + region (30 cases)

Tests whether the dataset can filter by category × geography. This requires
proper tagging and metadata; failures here indicate missing structure.

| ID | Lang | Query | Expected topic | Pass criteria |
|----|------|-------|----------------|---------------|
| L2-01 | en | What are some traditional onsen ryokan in the Tohoku region? | 東北 秘湯ranges | Returns 3+ ryokan across multiple Tohoku prefectures |
| L2-02 | ja | 四国の「お遍路」で泊まれる宿坊を教えて | 四国遍路 宿坊 | 88札所周辺、複数県で宿泊可能宿坊リスト |
| L2-03 | zh | 推荐一些北海道的农家体验。 | 北海道 農業体験 | 富良野・美瑛・十勝の牧場・農園体験 |
| L2-04 | en | Where can I see traditional pottery being made in Kyushu? | 九州 陶芸窯元 | 有田・伊万里・小石原・薩摩の窯元 |
| L2-05 | ko | 도호쿠 지방의 전통 축제를 알려주세요. | 東北 祭り | ねぶた・竿燈・七夕・花笠 等の複数都道府県 |
| L2-06 | es | Lugares para ver cerezos en flor en Tohoku, no en Tokio. | 東北 桜 | 角館・弘前・北上・三春など |
| L2-07 | en | List the major sake breweries in Niigata prefecture. | 新潟 酒蔵 | 越乃寒梅・八海山・久保田の蔵元等 |
| L2-08 | fr | Stations de ski avec sources thermales dans la région d'Hakuba. | 白馬 スキー場+温泉 | 白馬五竜・白馬岩岳・白馬乗鞍 |
| L2-09 | en | What are the best autumn foliage spots in the Kansai region? | 関西 紅葉 | 嵐山・東福寺・高雄・談山神社等 |
| L2-10 | ar | ما هي الأماكن المشهورة بأزهار الكرز في كانساي؟ | 関西 桜 | 吉野山・嵐山・哲学の道等 |
| L2-11 | ja | 沖縄の離島で星空が綺麗な場所はどこ？ | 沖縄 星空 | 石垣島・波照間島・西表島等(国際ダークスカイ含む) |
| L2-12 | th | ที่พักออนเซ็นในชนบทของฮอกไกโด | 北海道 田舎 温泉 | 登別・洞爺・ニセコ以外も含む地方温泉 |
| L2-13 | vi | Các đảo ở Biển nội địa Seto đáng ghé thăm. | 瀬戸内 島々 | 直島・豊島・小豆島・大三島等 |
| L2-14 | en | Indigo dyeing workshops in Tokushima prefecture. | 徳島 藍染 | 阿波藍・佐藤昭人氏の工房等 |
| L2-15 | de | Buddhistische Tempel mit Übernachtungsmöglichkeit (Shukubo) auf dem Berg Koya. | 高野山 宿坊 | 金剛峯寺周辺の複数宿坊 |
| L2-16 | en | Off-the-beaten-path samurai districts outside of Kyoto. | 武家屋敷 地方 | 角館・知覧・萩・松江等 |
| L2-17 | id | Festival musim panas di prefektur Akita. | 秋田 夏祭り | 竿燈祭り・西馬音内盆踊り・大曲花火大会 |
| L2-18 | ko | 산인 지방의 작은 항구 마을. | 山陰 漁港 町 | 境港・温泉津・濱田・益田等 |
| L2-19 | en | Where can I experience washi paper making in Gifu? | 岐阜 和紙 体験 | 美濃和紙、本美濃紙、UNESCO |
| L2-20 | es | Pueblos de pescadores en la península de Noto. | 能登 漁村 | 輪島・珠洲・能登町・舳倉島等 |
| L2-21 | en | Lesser-known sand dunes in Japan, not just Tottori. | 砂丘 全国 | 中田島砂丘(浜松)・吹上浜(鹿児島)・猿ヶ森砂丘(青森) |
| L2-22 | zh | 山阴地区的传统工艺品。 | 山陰 工芸 | 出雲石燈籠・石州和紙・弓浜絣・出西窯 |
| L2-23 | en | What lavender fields exist in Hokkaido beyond Furano? | 北海道 ラベンダー | 富良野以外、上富良野・中富良野・東神楽等 |
| L2-24 | tl | Mga tradisyonal na bayan ng kape sa Kyushu. | 九州 古い町並み | 日田・浮羽・人吉・薩摩川内等(コーヒーとは限らない、誤訳テスト) |
| L2-25 | ja | 北陸地方で泊まれる古民家を教えて | 北陸 古民家 | 五箇山・白川郷以外、能登・加賀・福井の古民家 |
| L2-26 | en | Mountain shrines in the Kii Peninsula. | 紀伊半島 山岳信仰 | 熊野三山・吉野・大峰・玉置神社等 |
| L2-27 | en | Summer fireworks festivals along the Sea of Japan coast. | 日本海 花火 | 長岡・鯖江・米子・酒田・新潟祭り |
| L2-28 | en | Traditional bamboo crafts in Oita prefecture. | 大分 竹工芸 | 別府竹細工、伝統工芸品 |
| L2-29 | en | Cycling routes through rural Shikoku. | 四国 サイクリング | しまなみ海道以外、四万十川・遍路道路線等 |
| L2-30 | en | Where to see traditional kabuki outside of Tokyo and Kyoto. | 地方 歌舞伎 | 金丸座(琴平)・小鹿野歌舞伎・嬬恋等地芝居 |

---

## L3 — Experience-based abstract (30 cases)

The user describes a desired *experience* without naming a place. The MCP
server must understand the intent and return relevant places. This is where
Google Places fails — and where this project should win.

| ID | Lang | Query | Expected topic | Pass criteria |
|----|------|-------|----------------|---------------|
| L3-01 | en | I want to see fireworks in Japan. | 花火大会 | Returns major fireworks events with date/location, multiple regions |
| L3-02 | ja | 日本で花火を見てみたい。 | 花火大会 | L3-01の日本語版、長岡・大曲・隅田川等 |
| L3-03 | en | Where can I experience snow festivals in Japan? | 雪祭り | 札幌雪まつり、横手かまくら、湯西川等 |
| L3-04 | zh | 我想在日本体验真正的乡村生活。 | 田舎暮らし体験 | 農泊・グリーンツーリズム、白川郷・五箇山等 |
| L3-05 | ko | 일본에서 단풍을 즐길 수 있는 곳을 추천해 주세요. | 紅葉 | 嵐山・日光・栗駒・河口湖・耶馬溪等 |
| L3-06 | en | I want a quiet place to meditate in Japan, not a touristy temple. | 静かな寺 修行 | 永平寺・恐山・比叡山等、観光地以外の修行寺 |
| L3-07 | es | Quiero ver auroras boreales en Japón. | オーロラ Japan | 道東(北海道網走・知床)で見られる稀現象 |
| L3-08 | en | Where can I sleep in a 100-year-old house in Japan? | 古民家 宿泊 | 全国の古民家リノベーション宿、Airbnb等でない |
| L3-09 | th | สถานที่ใหม่นอกจากการท่องเที่ยวที่ไม่มีนักท่องเที่ยว | 桜 穴場 | 観光地化されてない桜の名所、地方の小さな名所 |
| L3-10 | en | I love photography. Where in Japan has the most dramatic landscapes? | 絶景 写真 | 鳥取砂丘・四国カルスト・上高地・トロッコ列車等 |
| L3-11 | ar | أريد تجربة حمامات الينابيع الساخنة في الطبيعة، لا في الفنادق. | 露天風呂 自然 | 黒湯温泉・乳頭・宝川・川湯等の野湯系 |
| L3-12 | en | I want to swim with wild dolphins in Japan. | 野生イルカ 体験 | 御蔵島・小笠原・天草等のドルフィンスイミング |
| L3-13 | en | Best places in Japan to see traditional architecture untouched by modernization. | 重伝建地区 | 重要伝統的建造物群保存地区:大内宿・倉敷美観等 |
| L3-14 | vi | Tôi muốn trải nghiệm văn hóa Ainu ở Hokkaido. | アイヌ文化 体験 | 二風谷・白老ウポポイ・阿寒湖アイヌコタン等 |
| L3-15 | en | Where can I find Buddhist statues carved into cliffs in Japan? | 磨崖仏 | 臼杵・箱根根・国東半島・栃山摩崖磯遺等 |
| L3-16 | en | Volcano hikes you can do in a single day from Tokyo. | 火山 日帰り | 浅間・三原山・草津・霧ヶ峰・伊豆大島等 |
| L3-17 | id | Saya ingin makan tofu yang baru dibuat di kuil. | 寺 豆腐 体験 | 高野山・嵐山・京都の精進料理寺院 |
| L3-18 | en | I want to see fishing villages frozen in time. | 古い漁港 | 舟屋(伊根)・鞆の浦・宮津島・室之鼻等 |
| L3-19 | en | Where can I learn traditional Japanese paper making from a master? | 和紙 職人 体験 | 美濃和紙・越前和紙・土佐和紙の体験施設 |
| L3-20 | ja | まるで時代劇のような景色の場所に行きたい。 | 時代劇ロケ地 | 妻籠・馬籠・倉敷・宝塚松山・五箇泉村等 |
| L3-21 | en | Beaches in Japan that aren't crowded with tourists. | 穴場 ビーチ | 八重山・五島・天草・若狭・隠岐等 |
| L3-22 | en | Where can I drink with locals at a small old-school izakaya? | ローカル 居酒屋 横丁 | 立石・新橋・新橋・京橋(大阪)・国分町(仙台)等 |
| L3-23 | de | Ich möchte mit der Bahn durch ländliches Japan fahren. | ローカル線 観光 | 五能線・只見線・地方鉄道・由利高原等 |
| L3-24 | en | Places in Japan to see firefly viewing in summer. | ホタル | 蛍観賞地、6-7月、源氏蛍・平家蛍 |
| L3-25 | ru | Где в Японии можно увидеть журавлей зимой? | ツル 越冬 | 出水(鹿児島)・釧路湿原(北海道) |
| L3-26 | en | I want to spend the night in a Buddhist temple. | 宿坊 体験 | 高野山・恐山・身延山・羽黒山等 |
| L3-27 | en | Quiet hot spring villages where you can walk in yukata between baths. | 温泉街 浴衣 | 城崎・銀山・黒沢・鳴子・湯田中・草津等 |
| L3-28 | fr | Je voudrais voir des baleines au Japon. | クジラ ホエールウォッチング | 小笠原・座頭鯨・室戸・知床等 |
| L3-29 | en | Where can I experience the traditional Japanese tea ceremony deeply, not as a tourist show? | 茶道 本格 体験 | 京都の茶道家紹介・裏千家・表千家・武者小路千家関係 |
| L3-30 | en | Mountain villages where the train comes once every two hours. | ローカル線 山村 | 五能線・木次線・芸備線・只見線等の極ローカル路線駅 |

---

## L4 — Cultural exploration (20 cases)

The user is asking for *taste-driven curation*. There may be no "correct"
answer; what matters is whether the system surfaces **interesting,
non-obvious, structurally diverse** options. This is the project's signature.

If the MCP server can answer L4 well, it has crossed into territory no other
travel data source covers.

| ID | Lang | Query | Expected topic | Pass criteria |
|----|------|-------|----------------|---------------|
| L4-01 | en | Tell me about Japan's traditional food culture that hasn't gone mainstream yet. | 伝統食 知られざる | 発酵食(ふなずし・くさや)・ハント・郷土料理(ばっけ味噌・ジビエ)等 |
| L4-02 | ja | まだメジャーじゃない日本の伝統的な食文化を教えて。 | L4-01の日本語版 | 各地、地域固有の発酵・保存食・年中行事食 |
| L4-03 | en | Forgotten craftsman skills still alive in Japan. | 失われゆく職人技 | 漆掻き・桶締め・手作り銅器・組子細工・刀鍛冶等 |
| L4-04 | en | Japanese landscapes that look like a Hokusai woodblock print. | 浮世絵風景 | 田貫湖・三保の松原・神奈川沖等浮世絵モチーフ地 |
| L4-05 | en | Lesser-known UNESCO sites in Japan. | UNESCO 知られざる | 富岡製糸場・石見銀山・百舌鳥古市古墳群・宗像沖ノ島等 |
| L4-06 | en | Areas in Japan where the old Joumon-era culture still influences daily life. | 縄文文化 現代 | 三内丸山・是川・小石・縄文遺跡群東北・北海道等 |
| L4-07 | zh | 日本各地有什么特色的发酵食品文化？ | 発酵食 全国 | 各都道府県の発酵食品(味噌・醤油・酒・酢・漬物)地域差 |
| L4-08 | en | Hidden mountain villages where shamanic traditions still exist. | 山岳信仰 シャーマン | 恐山・羽黒・出羽三山・大峰・遠野等 |
| L4-09 | en | Areas in Japan where nuclear bomb history is part of daily landscape. | 戦争遺跡 日常 | 広島・長崎の原爆遺構、平和記念公園以外。 |
| L4-10 | en | Japanese towns built around a single craft industry. | 工芸の町 | 燕三条(刃物)・関(刃物)・有田(陶磁)・輪島(漆)・西陣(織)等 |
| L4-11 | en | Where can I see Japan's response to industrial decline preserved? | 産業遺産 | 軍艦島・三池炭鉱・足尾鉱山・尾去沢等 |
| L4-12 | ko | 일본의 종교적 다양성을 가장 잘 보여주는 지역은? | 宗教多様性 | 長崎(キリスト教)・高野山(密教)・出雲(神道)・恐山(山岳信仰) |
| L4-13 | en | Lost or dying festivals that still happen in remote Japan. | 消えゆく祭り | 限界地で継続する小規模伝統行事、無形民俗文化財 |
| L4-14 | en | Japanese coastal areas shaped by the 2011 tsunami, ten years on. | 震災復興 沿岸 | 陸前高田・気仙沼・南三陸・釜石・大船渡等 |
| L4-15 | en | Architecture that blends Western and Japanese styles from Meiji era. | 擬洋風建築 | 開智学校・福沢学校・中込学校・登米小常等 |
| L4-16 | en | Japan's hidden Christian heritage. | 隠れキリシタン | 五島列島・平戸・天草・大浦天主堂、潜伏キリシタン関連 |
| L4-17 | en | Traditional Japanese gardens designed by lesser-known garden masters. | 庭園 知られざる | 重森三玲・夢窓疎石以外の地方の名園、足立美術館等 |
| L4-18 | en | Where can I experience Japan's traditional textile dyeing techniques? | 染色 伝統技法 | 紅型・絞り・型染・草木染・藍染等地域別 |
| L4-19 | en | Areas where you can still see remnants of Edo-period highway culture. | 街道 宿場町 | 中山道・東海道・奥州街道の宿場、妻籠・馬籠以外 |
| L4-20 | en | Japan's spiritual pilgrimages beyond Shikoku 88. | 巡礼 88以外 | 西国33・坂東33・秩父34・小豆島88・ーゲ地方等 |

---

## Test execution checklist

For each case, verify:

- [ ] **Tool was invoked** — check that `japan-travel-mcp` was actually called (not answered from LLM training data alone)
- [ ] **Right entity returned** — for L1/L2: the entity asked for. For L3/L4: relevant, non-obvious entries
- [ ] **Substantive content** — at least 2-3 sentences of meaningful text, not "no data found"
- [ ] **Language correctness** — response is in the requested language. RTL (Arabic) renders correctly. Non-Latin scripts (Thai, Hindi, Korean, Japanese, Chinese) are not garbled
- [ ] **Source preserved** — the response (or metadata) names the underlying source (municipal page, MAFF registry, JNTO, etc.)
- [ ] **No confusion** — when multiple entities share a name (e.g., "Yoshida"), the right one is returned
- [ ] **Disclaimer present** — the standard `disclaimer` field is included in the response

---

## Scoring rubric

For each case, score 0/1/2:

- **0 — Fail**: tool not called, wrong entity, no data, garbled language
- **1 — Partial**: right entity but thin content, or correct content but in wrong language, or mostly right but with factual errors
- **2 — Pass**: tool called, right entity, substantive multilingual content, source attribution

**Project release threshold:**

| Level | Min score for release |
|-------|-----------------------|
| L1 | ≥ 18/20 (90%) |
| L2 | ≥ 24/30 (80%) |
| L3 | ≥ 21/30 (70%) |
| L4 | ≥ 12/20 (60%) |
| **Total** | **≥ 75/100** |

L1 must be near-perfect: if named entities aren't reliably found, the dataset
is broken. L4 has the loosest bar because it's curation, not retrieval.

---

## Gap analysis template

For every case scored 0 or 1, capture in a separate file:

```
ID: L3-12
Score: 0
Failure mode: tool returned no results
Root cause hypothesis: dolphin-swim experiences not tagged as "wildlife
  encounter" in the schema; entity exists but unfindable by experience query
Proposed fix: add `experience_tags` field; backfill from JNTO experiential
  tourism database
Priority: high (blocks L3 abstraction layer entirely if unfixable)
```

This document IS the product quality bar. Keep it under version control,
re-run before each release, treat regressions as launch-blockers.
