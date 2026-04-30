# Quality test scoring — 100-case (pre-scrape baseline)

> Pre-scrape baseline = same harness as session_0501 (where Archie scored
> the 100 cases by hand at 13/100). This LLM-judge re-run scored the
> *current* `main` build but **before** the in-flight enriched scrape
> lands its richer body_paragraphs and multi-source seeds. The
> post-scrape SCORING_REPORT.post_scrape.md will be the final number.

Generated: 2026-04-30 17:55:21 UTC
Cases: 100
Judge: claude-sonnet-4-5 (LLM judge against KJ × Nancy 0/1/2 rubric)

## Totals

- score-2 (strong):  ** 20** / 100
- score-1 (partial): ** 34** / 100
- score-0 (off):     ** 46** / 100
- judge-failed:      0 / 100

**Raw points: 74 / 200 (37.0%)**

## Per-case detail

| ID | Tool | Score | Reason |
|:---|:-----|:-----:|:-------|
| L1-01 | get_local_food | 2 | The response correctly returns Tajima Beef (但馬牛) as the #1 result with accurate English description confirming it as the origin breed for Ko |
| L1-02 | get_local_food | 2 | The response perfectly addresses the Arabic query about Tajima beef in Hyogo. The first item (maff_gi:2) is exactly 但馬牛 (Tajima beef) with c |
| L1-03 | get_japan_heritage | 2 | The response contains the precise Japan Heritage designation (story 009) that explicitly covers Minami-Yamashiro village's tea fields. The b |
| L1-04 | get_festivals | 2 | The target festival 'Yoshida no Hi-Matsuri' (吉田の火祭) appears as the first result with correct Spanish name, description linking it to Fujiyos |
| L1-05 | get_local_food | 0 | Query asks specifically about 中芸地域 (Nakaei region) yuzu, but response contains 物部ゆず (Monobe yuzu from Kami City) and generic tourism pages.  |
| L1-06 | get_spots | 0 | Empty result list (count=0) for a query about Hirosaki Park cherry blossoms, one of Japan's most famous sakura destinations. The tool failed |
| L1-07 | search_area | 2 | The response correctly returns Izumo Taisha (Q696362) as the top result with accurate coordinates, names in Japanese/English, and clear iden |
| L1-08 | search_area | 2 | The response correctly returns the famous Itsukushima Shrine in Hiroshima (Q191763, prefecture_code 34) as the top result with proper Englis |
| L1-09 | get_japan_heritage | 0 | Query asks specifically about Kumano Kodo pilgrimage routes (熊野古道), but tool returned generic Japan Heritage sites in Wakayama Prefecture. R |
| L1-10 | search_area | 1 | Query seeks information about Himeji Castle (姫路城), a UNESCO World Heritage site. Response contains 36 matches but top results are all generi |
| L1-11 | get_traditional_arts | 0 | Query asks specifically for Bunraku performances in Osaka (ขอข้อมูลเกี่ยวกับการแสดงบุนรากุที่โอซาก้า). Response returns 183 traditional arts |
| L1-12 | get_local_specialty | 0 | Query asks about Yumihama Kasuri (弓浜絣), a traditional textile craft. Response returns only food GI products (rakkyo, broccoli, persimmon, wa |
| L1-13 | search_area | 2 | Query asks about Naoshima Art Island. Response correctly returns the municipality (直島町), the main art site (Benesse Art Site Naoshima) with  |
| L1-14 | get_spots | 0 | Empty result (count=0) with no explanation or hint why the query failed. The tool should have returned Kakunodate samurai district spots giv |
| L1-15 | get_spots | 0 | Query asks about Onomichi tourism information but response returns only a single low-quality item (score 0.52) labeled '注目ワード' (Featured Wor |
| L1-16 | search_area | 1 | Response contains related attractions (Kumano Nachi Taisha shrine, Nachi Kōgen Park) and the municipality, but critically missing Nachi Fall |
| L1-17 | search_area | 2 | Query asks about Shiretoko Peninsula in Hokkaido. Response correctly returns Shiretoko National Park as top result with comprehensive metada |
| L1-18 | search_area | 1 | Response contains relevant Dewa Sanzan content including Dewa Shrine (central pilgrimage site), Dewa Sanzan History Museum, and Dewa Sanzan  |
| L1-19 | search_area | 2 | Query about Yakushima island returns highly relevant results. Top items include Yakushima municipality, National Park, World Heritage Center |
| L1-20 | get_japan_heritage | 0 | Query asks about Sado Island (사도섬/佐渡島) but tool returns Niigata prefecture's Japan Heritage sites unrelated to Sado—results show Oyama pilgr |
| L2-01 | get_hotels | 0 | Query asks for traditional onsen ryokan in Tohoku region, but tool returns only Akita prefecture and results show modern hotels (ANA Crowne  |
| L2-02 | get_hotels | 0 | Query asks specifically for shukubo (temple lodgings) along the Shikoku pilgrimage route. Response returns generic hotels and guesthouses in |
| L2-03 | get_spots | 0 | Query seeks Hokkaido farm/agricultural experiences (農家体験). Response contains only unrelated municipal content: library exhibits, inbound tou |
| L2-04 | get_local_specialty | 1 | Response correctly returns Saga pottery (Imari-Arita, Karatsu) which are major Kyushu pottery centers, but misses other critical regions lik |
| L2-05 | get_festivals | 1 | Query asks for Tohoku region festivals but tool was called only for Aomori prefecture (one of six Tohoku prefectures). Response contains cor |
| L2-06 | get_spots | 0 | Query asks for cherry blossom viewing spots in Tohoku (not Tokyo), but response returns generic municipal pages from Akita about daily life, |
| L2-07 | get_local_specialty | 0 | Query asks for sake breweries (酒蔵) in Niigata, but the tool returned agricultural products (edamame, carrots, lotus root) from the GI design |
| L2-08 | get_spots | 0 | Query asks for ski resorts with hot springs in Hakuba. Response returns only 2 administrative items: a UN Tourism Village award announcement |
| L2-09 | get_spots | 0 | Query asks for autumn foliage spots in Kansai, but response contains only Kyotango city art festivals, textile history, and general municipa |
| L2-10 | get_spots | 1 | Query asks for famous cherry blossom spots in Kansai (関西 桜). Tool only queries Nara prefecture with no cherry blossom filter. Response does  |
| L2-11 | get_spots | 0 | Query asks for remote Okinawan islands with beautiful starry skies. Response returns only municipal pages from Ginowan City (宜野湾市) on main i |
| L2-12 | get_hotels | 0 | Query asks for rural onsen accommodations in Hokkaido (ที่พักออนเซ็นในชนบทของฮอกไกโด = onsen lodging in Hokkaido countryside). Response retu |
| L2-13 | get_spots | 1 | Query asks for Seto Inland Sea islands worth visiting (Vietnamese). Response returns Kagawa prefecture spots, which includes some Seto islan |
| L2-14 | get_local_specialty | 1 | Response contains relevant Tokushima crafts including Awa Washi (craft_id 0907) which mentions indigo-dyeing in its description. However, th |
| L2-15 | get_hotels | 0 | Query asks for Buddhist temple lodgings (shukubo) on Mount Koya, a specific religious accommodation type. Response returns generic Wakayama  |
| L2-16 | search_area | 2 | Response delivers diverse, geographically-spread samurai districts outside Kyoto: Shimane (Buke Yashiki), Fukui (Uchiyama), Fukushima (Aizu) |
| L2-17 | get_festivals | 1 | Response returns 39 Akita festivals with proper Indonesian translations, including some legitimate cultural properties. However, it misses t |
| L2-18 | get_spots | 0 | Query seeks small fishing port towns in San'in region. Response returns generic municipal events from Matsue city hall (new building opening |
| L2-19 | get_local_specialty | 0 | Query asks specifically about washi paper making experiences in Gifu. Response returns Gifu crafts including Mino Ware pottery, Hidehira lac |
| L2-20 | get_spots | 0 | Query seeks fishing villages (pueblos de pescadores) in Noto Peninsula, but response returns generic municipal navigation pages from Komatsu |
| L2-21 | search_area | 1 | Response contains some sand dune-related content (Tottori, Hamaoka, Ishikari museums, Okinawa sites) but misses major lesser-known dunes lik |
| L2-22 | get_local_specialty | 2 | Query asks for traditional crafts in the San'in region (山陰 = Shimane/Tottori). Response returns 4 officially designated traditional crafts f |
| L2-23 | get_spots | 0 | Response contains only generic municipal events and administrative content (library exhibits, tourism information pages, art exhibitions, ch |
| L2-24 | get_spots | 0 | Query asks for traditional coffee towns in Kyushu (likely mistranslation of 町並み as 'towns of coffee' instead of 'townscapes'). Response retu |
| L2-25 | get_hotels | 0 | Query asks for traditional Japanese houses (古民家) in Hokuriku region where one can stay. Tool only searched Ishikawa prefecture (one of four  |
| L2-26 | get_japan_heritage | 0 | Query asks for mountain shrines in the Kii Peninsula related to mountain worship (山岳信仰). Response returns Wakayama Japan Heritage sites abou |
| L2-27 | get_festivals | 0 | Tool returned UNESCO Intangible Cultural Heritage items (traditional dances, shrine festivals) from various prefectures—none are summer fire |
| L2-28 | get_local_specialty | 2 | Response directly returns Beppu Bamboo Crafts (別府竹細工), the canonical traditional bamboo craft of Oita, with comprehensive metadata including |
| L2-29 | get_spots | 0 | Query asks for cycling routes through rural Shikoku, but response returns archaeological sites, museums, and castles in Ehime with no cyclin |
| L2-30 | get_traditional_arts | 1 | Response contains general traditional arts (183 items) but completely misses the specific intent: kabuki performed in regional areas. Top re |
| L3-01 | get_festivals | 0 | The tool returned 81 general festivals (matsuri) but fireworks are not the central feature of these cultural property festivals. The user ex |
| L3-02 | get_festivals | 0 | User wants to see fireworks (花火大会), but get_festivals returns generic matsuri data (shrine festivals, cultural heritage events) with no ment |
| L3-03 | get_festivals | 0 | Query asks for snow festivals (雪祭り) but tool returned Hokkaido festivals in general, which are mostly UNESCO heritage dances/summer festival |
| L3-04 | get_japan_heritage | 0 | Query seeks rural life experiences in Japan, but tool returned Japan Heritage cultural/educational sites (historical schools, castles, Edo-p |
| L3-05 | search_area | 2 | Query asks for autumn foliage viewing spots in Japan. Response returns 70 matches with top results containing famous momiji (紅葉) parks like  |
| L3-06 | search_area | 1 | Response contains relevant content about spiritual/ascetic training sites (禅修行場, 修験道) and pilgrimage routes, but misses the core user intent |
| L3-07 | search_area | 2 | Empty result is correct. Japan does not have aurora borealis viewing areas in its tourism corpus. The tool correctly returned count=0 with p |
| L3-08 | get_hotels | 0 | Query asks specifically for 100-year-old traditional houses (古民家) for lodging. Response returns generic Gifu hotels (modern chains like Rout |
| L3-09 | search_area | 0 | Query is in Thai asking for 'hidden cherry blossom spots away from tourists', but tool returned generic results for '桜' (sakura) including m |
| L3-10 | search_area | 1 | Response contains relevant dramatic landscape sites (Japan Heritage scenic areas, coastal drives, mountain peaks, Cape Ashizuri lighthouse)  |
| L3-11 | search_area | 2 | Query seeks outdoor natural hot springs (not hotels). Response contains multiple relevant onsen facilities with outdoor baths (露天風呂). Top re |
| L3-12 | search_area | 1 | Response returns relevant dolphin facilities (つくみイルカ島 is a legitimate dolphin interaction park in Oita), but misses the wild dolphin swimmin |
| L3-13 | get_japan_heritage | 0 | The query asks for traditional architecture untouched by modernization, clearly seeking 重伝建地区 (Important Preservation Districts for Groups o |
| L3-14 | search_area | 2 | Response delivers exactly what the query asks for: multiple Ainu cultural experience facilities in Hokkaido. Top results include the Nationa |
| L3-15 | search_area | 2 | Response contains canonical examples of cliff-carved Buddhist statues (磨崖仏) across Japan. Top results include specific named magaibutsu site |
| L3-16 | search_area | 0 | Query seeks day-hike volcanoes accessible from Tokyo, but results return museums, heritage sites, mud volcanoes, and disaster prevention cen |
| L3-17 | search_area | 0 | Query asks for eating freshly made tofu at a temple (寺). Response returns frozen tofu products, tofu recipes, and a farmers market notice -  |
| L3-18 | search_area | 1 | Response contains fishing port-related content but misses the key intent of 'frozen in time' villages. Results include administrative docume |
| L3-19 | get_local_specialty | 0 | The query asks specifically for traditional Japanese paper making (和紙) experiences with masters. The tool returned 231 craft items, but the  |
| L3-20 | search_area | 1 | The query seeks locations with period-drama-like scenery. The tool returned 24 results for "宿場" (post towns), which are indeed historic site |
| L3-21 | search_area | 1 | Response contains beach-related content but fails to address the core intent of 'uncrowded/hidden beaches'. Results include theme parks (Min |
| L3-22 | search_area | 1 | Response contains some yokocho (alley districts) but misses the iconic izakaya yokocho like Omoide Yokocho (Shinjuku), Harmonica Yokocho (Ki |
| L3-23 | search_area | 0 | Empty result list (count=0) for a valid tourism query about local railway lines. The query intent is to find scenic rural train routes in Ja |
| L3-24 | search_area | 2 | The response contains highly relevant firefly viewing locations across Japan including museums (Firefly Museum of Toyota Town), dedicated pa |
| L3-25 | search_area | 1 | The query asks where to see cranes (журавли) wintering in Japan. While search returned 247 matches for '鶴', the top results are mostly munic |
| L3-26 | search_area | 1 | Response contains relevant shukubo content (Oyama and Mitake temple lodgings, Japan Heritage designation) but these are all informational/pr |
| L3-27 | search_area | 1 | Response contains some relevant hot spring villages (Oku-Hida Onsen Villages, Niseko Onsenkyō, Gero, etc.) but mostly returns generic 温泉-rel |
| L3-28 | search_area | 1 | Query asks to see whales in Japan. Response includes one highly relevant result (Tokashiki whale watching association with detailed descript |
| L3-29 | get_japan_heritage | 1 | Response contains relevant Japan Heritage sites about Japanese tea culture (story 009 discusses tea ceremony history in Kyoto/Yamashiro regi |
| L3-30 | search_area | 0 | Query seeks mountain villages with infrequent train service (rural rail tourism). Response returns unrelated results: ambassador recruitment |
| L4-01 | get_local_food | 1 | Response returns 507 GI-designated foods, which are traditional regional products, partially relevant to the query. However, top results inc |
| L4-02 | get_local_food | 1 | Response returns 507 GI-designated foods (地理的表示保護制度), which are officially recognized traditional/regional foods. However, top results inclu |
| L4-03 | get_traditional_arts | 1 | Query asks for forgotten craftsman skills, but tool returns performing arts and festivals (nōgaku, matsuri) rather than craft traditions lik |
| L4-04 | search_area | 1 | Query seeks Hokusai-like landscapes but tool searched only 富士 (Fuji). Mount Fuji itself (#1) is indeed central to Hokusai's work, making it  |
| L4-05 | get_japan_heritage | 0 | Query asks for 'lesser-known UNESCO sites' but the tool returns Japan Heritage (日本遺産) items, which is a completely different designation sys |
| L4-06 | search_area | 0 | Query asks for areas where Jomon culture still influences daily life, which requires contemporary cultural continuity data. Response returns |
| L4-07 | get_local_food | 0 | Query asks about fermented food culture (发酵食品文化) across Japan, but the tool returned a generic designated food list dominated by non-ferment |
| L4-08 | get_traditional_arts | 0 | Query seeks hidden mountain villages with shamanic traditions. Tool returned generic list of Important Intangible Cultural Properties (Noh t |
| L4-09 | search_area | 2 | Response perfectly addresses the query intent. Top results include the canonical atomic bomb sites in Hiroshima and Nagasaki (Peace Memorial |
| L4-10 | get_local_specialty | 1 | Response returns 231 traditional craft items with metadata (name, location, description), which is relevant to craft industries. However, it |
| L4-11 | search_area | 1 | Response includes relevant industrial heritage sites (Tomioka Silk Mill World Heritage, Japan Heritage designations on industrial themes, mi |
| L4-12 | get_japan_heritage | 0 | Query asks which region best shows Japan's religious diversity. The tool returned Japan Heritage sites, with the top result about Edo-period |
| L4-13 | get_festivals | 1 | Returns 81 Important Intangible Folk Cultural Properties—festivals officially designated as endangered traditions. However, the query specif |
| L4-14 | search_area | 1 | Response contains 3-4 relevant 2011 tsunami memorial museums (Fukushima, Kesennuma, Iwate, Miyagi) with proper coordinates and English names |
| L4-15 | search_area | 1 | Response contains one result related to 擬洋風建築 (pseudo-Western architecture) from Meiji era, but it's a municipal event page titled 'キーワード検索' |
| L4-16 | get_japan_heritage | 0 | Query targets hidden Christian heritage (隠れキリシタン), specifically UNESCO sites in Nagasaki/Kumamoto. Response returns 8 generic Nagasaki herit |
| L4-17 | search_area | 1 | Returns relevant Japanese gardens but misses the query's key intent: 'lesser-known garden masters.' The results include famous gardens (Hama |
| L4-18 | get_local_specialty | 1 | Response returns valid traditional craft items but misses the core intent. Query seeks experiential dyeing opportunities (workshops, hands-o |
| L4-19 | search_area | 2 | Response strongly matches intent. Top results include actual post-town walking routes (Namerikawa, Kumagaya with Nakasendo stamp rally), Jap |
| L4-20 | get_japan_heritage | 0 | Query asked for spiritual pilgrimages beyond Shikoku 88, expecting routes like Kumano Kodo, Saigoku 33, or Saikoku pilgrimage. Response retu |
