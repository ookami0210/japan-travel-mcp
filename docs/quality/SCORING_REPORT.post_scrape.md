# Quality test scoring — 100-case (post-scrape)

Generated: 2026-05-01 09:23:29 UTC
Cases: 100
Judge: claude-sonnet-4-5 (LLM judge against our 0/1/2 rubric)

## Totals

- score-2 (strong):  ** 19** / 100
- score-1 (partial): ** 35** / 100
- score-0 (off):     ** 46** / 100
- judge-failed:      0 / 100

**Raw points: 73 / 200 (36.5%)**

## Per-case detail

| ID | Tool | Score | Reason |
|:---|:-----|:-----:|:-------|
| L1-01 | get_local_food | 2 | The response perfectly addresses the query intent. The top result is Tajima Beef (但馬牛) with comprehensive metadata including GI registration |
| L1-02 | get_local_food | 2 | Perfect match. The Arabic query asks about Tajima beef in Hyogo, the origin of Kobe beef. The top result is exactly 但馬牛 (Tajima beef) with c |
| L1-03 | get_japan_heritage | 2 | The query asked for tea fields of Minami-Yamashiro village specifically. The response's first item (story 009: '800-Year History Walk of Jap |
| L1-04 | get_festivals | 2 | The response returns exactly what was requested: the Yoshida Fire Festival (吉田の火祭) at the top of the results list with correct Spanish trans |
| L1-05 | get_local_food | 0 | Query asks specifically about 中芸地域の柚子 (Nakaei region yuzu), but response returns 物部ゆず from 香美市 (different region) and generic unrelated page |
| L1-06 | get_spots | 0 | Empty result (count=0) for a query about Hirosaki Park cherry blossoms, a world-famous sakura viewing destination in Aomori. The tool failed |
| L1-07 | search_area | 2 | The response correctly returns 出雲大社 (Izumo Taisha, QID Q696362) as the top result with complete metadata including name, English description |
| L1-08 | search_area | 2 | The famous Itsukushima Shrine in Hiroshima (Q191763, UNESCO World Heritage site) appears as the #1 result with correct coordinates, prefectu |
| L1-09 | get_japan_heritage | 0 | Query asks specifically about Kumano Kodo pilgrimage trail (熊野古道). Response returns Japan Heritage sites in Wakayama Prefecture, but the top |
| L1-10 | search_area | 1 | Query asks about Himeji Castle specifically. Response includes 36 matches but top results are generic navigation pages ('くらし・手続きトップ') from H |
| L1-11 | get_traditional_arts | 0 | Query asks specifically for Bunraku (文楽) performances in Osaka. The response returns 183 general traditional arts items with top results sho |
| L1-12 | get_local_specialty | 0 | Query asks about Yumihama Kasuri (弓浜絣), a traditional textile craft from Tottori. The response returns only food GI products (rakkyo, brocco |
| L1-13 | search_area | 2 | Response correctly identifies Naoshima (直島町 municipality) and includes the canonical art destinations: Benesse Art Site Naoshima and Naoshim |
| L1-14 | get_spots | 0 | Empty result (count=0) for a well-known tourist destination that should exist in Akita tourism data. The Kakunodate samurai district is a ma |
| L1-15 | get_spots | 0 | Query asks about Onomichi tourism generally. Response returns a single administrative notice about bridge traffic (注目ワード = 'featured keyword |
| L1-16 | search_area | 1 | Query asks about Nachi Falls (那智の滝) but response doesn't include the waterfall itself—only related attractions like Kumano Nachi Taisha shri |
| L1-17 | search_area | 2 | Query asks about Shiretoko Peninsula in Hokkaido. Response correctly returns top-ranked canonical assets: Shiretoko National Park (Q739391), |
| L1-18 | search_area | 1 | Response contains relevant Dewa Sanzan content (Dewa Shrine #1, Dewa Sanzan History Museum #4, Dewa Sanzan Shrine #11) but the central asset |
| L1-19 | search_area | 2 | Query asks about Yakushima Island (Portuguese). Response correctly returns the municipality (屋久島町), Yakushima National Park, World Heritage  |
| L1-20 | get_japan_heritage | 0 | Query asks about Sado Island (사도섬/佐渡島), but the tool returned Japan Heritage sites in Niigata Prefecture that have no connection to Sado. Th |
| L2-01 | get_hotels | 0 | Query asks for traditional onsen ryokan in Tohoku region, but tool only searched Akita prefecture and returned generic hotels/guesthouses (A |
| L2-02 | get_hotels | 0 | Query asks for shukubo (temple lodgings) along the Shikoku pilgrimage route. Response returns generic hotels/guesthouses from Tokushima with |
| L2-03 | get_spots | 0 | Query seeks Hokkaido farm/agriculture experiences (农家体验), but the response contains completely unrelated content: library exhibitions, inbou |
| L2-04 | get_local_specialty | 1 | Query asks for pottery-making sites across Kyushu, but tool only queried Saga prefecture. Response correctly returns Imari-Arita and Karatsu |
| L2-05 | get_festivals | 1 | Query asks for Tohoku region festivals, but tool was called with only Aomori prefecture (1 of 6 Tohoku prefectures). Response contains excel |
| L2-06 | get_spots | 0 | Query asks for cherry blossom viewing spots in Tohoku (excluding Tokyo), but response returns generic municipal pages from Akita about daily |
| L2-07 | get_local_specialty | 0 | Query asks for sake breweries (酒蔵), but the tool returned food GI products (edamame, carrots, lotus roots). The get_local_specialty tool ret |
| L2-08 | get_spots | 0 | Query asks for ski resorts with hot springs in Hakuba. Response returns only 2 generic admin/navigation pages: a UN Tourism award announceme |
| L2-09 | get_spots | 0 | Query asks for best autumn foliage spots in Kansai region, but response returns generic Kyoto municipal content about art festivals, textile |
| L2-10 | get_spots | 1 | Query asks for famous cherry blossom spots in Kansai (in Arabic). Tool called only Nara prefecture with generic limit. Response includes one |
| L2-11 | get_spots | 0 | Query asks for remote Okinawa islands with beautiful starry skies. Response returns generic municipal pages from Ginowan City (urban area on |
| L2-12 | get_hotels | 0 | Query asks for rural Hokkaido onsen accommodations (ที่พักออนเซ็นในชนบทของฮอกไกโด = onsen lodging in Hokkaido countryside). Response returns |
| L2-13 | get_spots | 1 | Query asks for Seto Inland Sea islands worth visiting (Vietnamese). Response returns Kagawa spots but misses central Seto islands like Naosh |
| L2-14 | get_local_specialty | 1 | Response returns traditional crafts from Tokushima including indigo-dyed washi (阿波藍染和紙), which is related to indigo dyeing. However, the que |
| L2-15 | get_hotels | 0 | Query asks specifically for Buddhist temple lodgings (shukubo) on Mount Koya, which are a unique accommodation type. Response returns generi |
| L2-16 | search_area | 2 | Response contains multiple strong off-the-beaten-path samurai districts outside Kyoto: Shimane (武家屋敷 Q11545900), Fukui (旧内山家), Fukushima (Ai |
| L2-17 | get_festivals | 1 | Response contains 39 festivals from Akita prefecture with proper Indonesian translations, but lacks the most iconic summer festivals like Ak |
| L2-18 | get_spots | 0 | Query seeks small fishing port towns in San'in region. Response contains only municipal administrative pages from Matsue city (city hall eve |
| L2-19 | get_local_specialty | 0 | Query asks specifically about washi paper making experiences in Gifu. Response returns 9 craft items but shows Mino Ware pottery, Hidehira-n |
| L2-20 | get_spots | 0 | Query asks for fishing villages in Noto Peninsula (能登半島の漁村), but response only contains generic administrative/event pages from Komatsu city |
| L2-21 | search_area | 1 | The response contains some relevant sand dune content (浜岡砂丘 in Shizuoka, いしかり砂丘 museum in Hokkaido, 三種町 sand dune facilities), but misses ma |
| L2-22 | get_local_specialty | 2 | Query asked for 山陰 (San'in) traditional crafts in Chinese. Tool correctly returned 4 designated traditional crafts from Shimane (core San'in |
| L2-23 | get_spots | 0 | The response contains no lavender-related content. All returned spots are generic municipal events (library exhibitions, cultural shows, cen |
| L2-24 | get_spots | 0 | Query asks for traditional coffee towns in Kyushu (likely mistranslation of 'kape'=machi/towns), seeking historic streets/townscapes. Tool r |
| L2-25 | get_hotels | 0 | Query asks for traditional old houses (古民家) you can stay at in Hokuriku region. Tool only searched Ishikawa prefecture (1 of 4 Hokuriku pref |
| L2-26 | get_japan_heritage | 0 | Query seeks mountain shrines in the Kii Peninsula related to mountain worship (山岳信仰). The response returns Wakayama Japan Heritage sites abo |
| L2-27 | get_festivals | 0 | Query asks for summer fireworks festivals along the Sea of Japan coast. Response returns UNESCO cultural heritage festivals from Niigata pre |
| L2-28 | get_local_specialty | 2 | The response correctly returns Beppu Bamboo Crafts (別府竹細工), which is the canonical answer for traditional bamboo crafts in Oita. It appears  |
| L2-29 | get_spots | 0 | Query seeks cycling routes through rural Shikoku, but response returns archaeological sites, museums, and castles in Ehime. No cycling route |
| L2-30 | get_traditional_arts | 0 | Query asks specifically about kabuki performances outside Tokyo/Kyoto, but the tool returned generic traditional arts (Noh, festivals, shrin |
| L3-01 | get_festivals | 0 | Query seeks fireworks festivals (hanabi taikai), but response returns general cultural festivals from intangible heritage database. None of  |
| L3-02 | get_festivals | 0 | User wants to see fireworks (花火大会), but get_festivals returned 81 general festivals (matsuri) with no fireworks content visible. The respons |
| L3-03 | get_festivals | 0 | Query asks for snow festivals (雪祭り), but tool returned Hokkaido's UNESCO festivals including sacred dances, shrine festivals, and summer eve |
| L3-04 | get_japan_heritage | 0 | The query seeks authentic rural life experiences in Japan, but the tool returned Japan Heritage designations about historical education site |
| L3-05 | search_area | 1 | Query asks for autumn foliage recommendations in Japan. Response returns 70 matches of places named 紅葉 (momiji/maple) rather than curated au |
| L3-06 | search_area | 1 | The query seeks quiet meditation/training temples, but results are dominated by Japan Heritage sites and craft designations. The first resul |
| L3-07 | search_area | 2 | Empty result is the correct answer. Japan does not have designated aurora borealis viewing areas in tourism data. The query is geographicall |
| L3-08 | get_hotels | 0 | Query asks for 100-year-old houses (古民家/kominka). Response returns generic Gifu hotels with no indication of historic buildings, traditional |
| L3-09 | search_area | 0 | Query in Thai asks for 'hidden gem cherry blossom spots away from tourists'. Tool returned generic results for kanji '桜' (sakura) including  |
| L3-10 | search_area | 1 | Response contains relevant dramatic landscape designations (和歌の浦, 日本海絶景) and scenic spots (千里浜beach, 足摺岬lighthouse, 入笠山), but most results a |
| L3-11 | search_area | 2 | Query seeks outdoor natural hot springs (not hotels). Results contain multiple relevant rotenburo (露天風呂) facilities including natural settin |
| L3-12 | search_area | 1 | Response returns three dolphin-related spots, including Tsukumi Dolphin Island which offers dolphin interaction experiences. However, these  |
| L3-13 | get_japan_heritage | 0 | The query asks for traditional architecture untouched by modernization (重伝建地区 - preserved historic districts). The tool returned Japan Herit |
| L3-14 | search_area | 2 | Response contains exactly what the user needs: multiple Ainu cultural museums and centers across Hokkaido with coordinates and descriptions. |
| L3-15 | search_area | 2 | Response returns 5 highly relevant cliff-carved Buddhist statue sites from diverse regions (Fukuoka, Kanagawa, Kagoshima, Oita). Results inc |
| L3-16 | search_area | 0 | Query seeks day-hike volcanoes from Tokyo, but response returns museums, mud volcanoes, disaster centers, and remote heritage sites (Shimane |
| L3-17 | search_area | 0 | Query intent is to eat freshly made tofu at a temple (寺 豆腐 体験). Response returns frozen tofu products, recipes, general food markets, and he |
| L3-18 | search_area | 1 | Response contains fishing port-related content but misses the user's intent of 'fishing villages frozen in time.' Results include administra |
| L3-19 | get_local_specialty | 1 | Query asks specifically about washi (Japanese paper) making experiences with masters. Response returns 231 traditional crafts filtered to 'c |
| L3-20 | search_area | 1 | The query seeks period-drama-like scenery/locations. The response returns historical post-town (宿場) content including walking routes and her |
| L3-21 | search_area | 1 | Response returns 37 beach-related results across Japan, but fails to address the core intent of 'uncrowded/hidden beaches' (穴場). Top results |
| L3-22 | search_area | 1 | Response contains 横丁 (alley) matches but misses the iconic izakaya yokocho like Omoide Yokocho (Shinjuku), Nonbei Yokocho (Shibuya), or Harm |
| L3-23 | search_area | 0 | Empty result (count=0) for a valid tourism query about local/scenic train lines in Japan. The corpus likely contains relevant content but th |
| L3-24 | search_area | 2 | Response contains multiple canonical firefly viewing locations across Japan including dedicated firefly museums (Firefly Museum of Toyota To |
| L3-25 | search_area | 1 | Query asks where to see cranes (журавли) in winter in Japan. The tool searched '鶴' (tsuru) which returns many municipalities/attractions wit |
| L3-26 | search_area | 1 | Response contains relevant shukubo (temple lodging) content from two locations (Oyama and Mt. Mitake), but misses actual bookable temples. R |
| L3-27 | search_area | 1 | Response contains hot spring villages (温泉郷) like Oku-Hida, Kaga, and Niseko which are relevant, but misses the canonical yukata-walking dest |
| L3-28 | search_area | 1 | Query asks to see whales in Japan. Response includes relevant whale-watching content (Tokashiki whale-watching association in Okinawa, Japan |
| L3-29 | get_japan_heritage | 1 | Query asks for deep, authentic tea ceremony experiences (not tourist shows). Response returns Japan Heritage sites in Kyoto, including one a |
| L3-30 | search_area | 0 | The query asks for mountain villages with infrequent train service, but the response contains completely unrelated content: recruitment for  |
| L4-01 | get_local_food | 0 | The query asks for traditional food culture that 'hasn't gone mainstream yet' (知られざる - lesser-known). The response returns 507 GI-designated |
| L4-02 | get_local_food | 1 | Response returns 507 GI-designated foods, which is comprehensive data. However, the query asks for 'not yet mainstream traditional food cult |
| L4-03 | get_traditional_arts | 1 | Query seeks forgotten craftsman skills, but tool returns performing arts and festivals (Noh, matsuri). While these are important intangible  |
| L4-04 | search_area | 1 | Response contains Mount Fuji (the iconic Hokusai subject) as #1, which is correct, but query intent was 'landscapes that look like Hokusai w |
| L4-05 | get_japan_heritage | 0 | The tool returned Japan Heritage sites, not UNESCO World Heritage sites. These are completely different designation systems. Japan Heritage  |
| L4-06 | search_area | 0 | The query asks for areas where Jomon culture still influences daily life today (contemporary cultural continuity), but the response returns  |
| L4-07 | get_local_food | 0 | Query asks about fermented food culture (发酵食品文化) across Japan. Tool returned GI-designated foods (cassis, beef, melon, tea) with zero fermen |
| L4-08 | get_traditional_arts | 0 | Query seeks hidden mountain villages with shamanic traditions. Response returns a broad list of traditional performing arts and festivals (N |
| L4-09 | search_area | 2 | Response perfectly captures the central assets for nuclear bomb history in daily landscape: Hiroshima Peace Memorial (原爆ドーム), multiple memor |
| L4-10 | get_local_specialty | 1 | The response returns 231 traditional crafts with detailed metadata (names, descriptions, production areas), which is relevant to Japanese cr |
| L4-11 | search_area | 1 | Query asks about Japan's response to industrial decline preservation. Response returns industrial heritage sites (Tomioka Silk Mill, coal/mi |
| L4-12 | get_japan_heritage | 0 | Query asks which region best shows Japan's religious diversity. Tool returned Japan Heritage educational sites (藩校, 私塾) with no religious co |
| L4-13 | get_festivals | 1 | The tool returns 81 Important Intangible Folk Cultural Properties, which are preservation-designated festivals, not necessarily 'lost or dyi |
| L4-14 | search_area | 1 | Response contains relevant 2011 tsunami memorial museums (Kesennuma, Iwate, Miyagi facilities) but buries them among unrelated earthquake si |
| L4-15 | search_area | 1 | Response contains one relevant result mentioning 擬洋風建築 (pseudo-Western architecture) from Meiji era, but it's a generic keyword search page  |
| L4-16 | get_japan_heritage | 1 | Query seeks Hidden Christian heritage sites, a UNESCO World Heritage topic primarily in Nagasaki/Kumamoto. The response returns 8 Nagasaki h |
| L4-17 | search_area | 1 | Response contains many Japanese gardens but lacks any information about garden masters or designers, which is central to the query. Returns  |
| L4-18 | get_local_specialty | 1 | Response returns valid traditional crafts with weaving/textile techniques, but focuses on weaving (織物) rather than specifically dyeing techn |
| L4-19 | search_area | 2 | The response returns highly relevant results for Edo-period highway culture and post towns (宿場町). Top results include specific walking tours |
| L4-20 | get_japan_heritage | 0 | Query asks for spiritual pilgrimages beyond Shikoku 88 (巡礼路). Response returns generic Japan Heritage items with first result about educatio |
