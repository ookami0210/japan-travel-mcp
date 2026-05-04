# Quality test scoring — 100-case (deep-scrape, rubric v1 — canonical-asset)

Generated: 2026-05-01 22:08:31 UTC
Cases: 100
Judge: claude-sonnet-4-5 (LLM judge against our 0/1/2 rubric)

## Totals

- score-2 (strong):  ** 14** / 100
- score-1 (partial): ** 32** / 100
- score-0 (off):     ** 54** / 100
- judge-failed:      0 / 100

**Raw points: 60 / 200 (30.0%)**

## Per-case detail

| ID | Tool | Score | Reason |
|:---|:-----|:-----:|:-------|
| L1-01 | get_local_food | 2 | Perfect match. The query asks about Tajima beef from Hyogo as the origin of Kobe beef. The response immediately returns Tajima Beef (但馬牛) as |
| L1-02 | get_local_food | 2 | The response perfectly answers the Arabic query about Tajima beef (但馬牛), returning it as the first result with accurate Arabic translation o |
| L1-03 | get_japan_heritage | 2 | The response correctly identifies Japan Heritage story 009 ('An 800-Year History Walk of Japanese Tea') which explicitly covers the Yamashir |
| L1-04 | get_festivals | 2 | The response returns the exact festival requested (Yoshida no Hi-Matsuri / 吉田の火祭) as the first result with correct Spanish name, location (F |
| L1-05 | get_local_food | 0 | Query asks specifically about 中芸地域の柚子 (Nakaei region yuzu), but response returns 物部ゆず from 香美市 (different region) and generic unrelated page |
| L1-06 | get_spots | 0 | Empty result (count=0) for a highly famous landmark that should exist in any Aomori tourism corpus. Hirosaki Park cherry blossoms are one of |
| L1-07 | search_area | 1 | Query asks about Izumo Taisha in Korean. Response contains relevant items mentioning 出雲大社, including tag page, live camera, and barrier-free |
| L1-08 | search_area | 0 | Query asks about Itsukushima Shrine in Hiroshima. Response contains 86 matches but top results are completely off-topic: Kagoshima tourism,  |
| L1-09 | get_japan_heritage | 0 | Query asks about Kumano Kodo pilgrimage route (熊野古道), but the tool returned general Wakayama Japan Heritage sites. While one result mentions |
| L1-10 | search_area | 1 | The response contains relevant content about Himeji Castle (姫路城), mentioning it as a World Heritage Site and providing some context about th |
| L1-11 | get_traditional_arts | 0 | Query asks specifically for Bunraku performances in Osaka (การแสดงบุนรากุที่โอซาก้า in Thai). The response returns 183 traditional arts item |
| L1-12 | get_local_specialty | 0 | Query asks specifically about Yumihama Kasuri (弓浜絣), a traditional textile craft from Tottori. The tool returned only food/agricultural GI p |
| L1-13 | search_area | 0 | Query is in Tagalog asking about Naoshima Art Island (直島), but the response returns wrong islands and municipalities. Top results include 直方 |
| L1-14 | get_spots | 0 | Empty result with count=0 for a major, well-known tourist attraction (Kakunodate samurai district). The query targets a canonical Japanese h |
| L1-15 | get_spots | 0 | Response returns only a single administrative notice about Onomichi Bridge traffic warnings, not tourism information about Onomichi city. Th |
| L1-16 | search_area | 0 | Query asks about Nachi Falls in Wakayama. Response returns municipality code for Nachi-Katsuura town but no information about the actual wat |
| L1-17 | search_area | 2 | Query is about Shiretoko Peninsula in Hokkaido (Hindi). The third result is a DMO plan chunk explicitly mentioning '世界自然遺産知床（自然）、知床国立公園（自然）、 |
| L1-18 | search_area | 2 | Response directly addresses Dewa Sanzan (出羽三山) query. Top result provides comprehensive description of the three sacred mountains (Haguro, G |
| L1-19 | search_area | 1 | Query asks about Yakushima island in Portuguese. Response includes the municipality 屋久島町 (correct) at top, plus one relevant tourism descrip |
| L1-20 | get_japan_heritage | 0 | Query asks about Sado Island (사도섬/佐渡島). Response returns 5 Japan Heritage sites from Niigata prefecture, but none are about Sado Island. Res |
| L2-01 | get_hotels | 0 | Query asks for traditional onsen ryokan in Tohoku region, but tool only searched Akita prefecture (1 of 6 Tohoku prefectures) and returned g |
| L2-02 | get_hotels | 0 | Query asks specifically for shukubo (temple lodgings) along the Shikoku pilgrimage route. Response returns generic hotels and guesthouses in |
| L2-03 | get_spots | 0 | Query asks for farm/agricultural experiences in Hokkaido, but response contains library exhibitions, inbound tourism guidance, art shows, an |
| L2-04 | get_local_specialty | 1 | Response contains two relevant Kyushu pottery items (Imari-Arita and Karatsu ware, both from Saga). However, query asked about 'Kyushu' broa |
| L2-05 | get_festivals | 1 | Query asks for Tohoku region traditional festivals but tool was called with only prefecture='Aomori' (one of six Tohoku prefectures). Respon |
| L2-06 | get_spots | 0 | Query asks for cherry blossom viewing spots in Tohoku region (Lugares para ver cerezos = places to see cherry blossoms). Response returns ge |
| L2-07 | get_local_specialty | 0 | Query asks for sake breweries (酒蔵), but the tool returned food products (edamame, carrots, lotus roots) from MAFF's GI registry. The respons |
| L2-08 | get_spots | 0 | Query asks for ski resorts with hot springs in Hakuba. Response returns only 2 administrative/navigation pages: a UN Tourism award announcem |
| L2-09 | get_spots | 0 | Query asks for autumn foliage spots in Kansai, but response contains art festivals, textile heritage, and cultural events in Kyotango City w |
| L2-10 | get_spots | 1 | Query asks for famous cherry blossom spots in Kansai (Arabic). Tool called Nara prefecture spots but without sakura/cherry keyword filtering |
| L2-11 | get_spots | 0 | Query asks for remote Okinawan islands with beautiful starry skies. Response returns generic municipal pages from Ginowan City (宜野湾市) on the |
| L2-12 | get_hotels | 1 | Query seeks rural Hokkaido onsen accommodations, but response returns generic hotels (ANA chains in Sapporo/Kushiro cities) and ski apartmen |
| L2-13 | get_spots | 1 | Query seeks Seto Inland Sea islands worth visiting (Vietnamese). Response returns Kagawa spots but misses canonical Seto islands like Naoshi |
| L2-14 | get_local_specialty | 1 | Query asks for indigo dyeing workshops, but response returns traditional craft designations (weave, pottery, paper). While item #1 'Awa Hon- |
| L2-15 | get_hotels | 0 | Query seeks Buddhist temple lodgings (shukubo) on Mount Kōya, but the tool returned generic hotels/guesthouses across Wakayama prefecture (T |
| L2-16 | search_area | 1 | Query seeks samurai districts outside Kyoto, but top results include a Saga overview in Chinese (#1), Kanazawa samurai district (#2, relevan |
| L2-17 | get_festivals | 1 | Response contains relevant Akita festivals but misses the most famous summer festivals (Kanto Matsuri, Akita Neburi Nagashi). Top results sh |
| L2-18 | get_spots | 0 | Query seeks small fishing port towns in San'in region (山陰の漁港町). Response returns only municipal events and administrative content from Matsu |
| L2-19 | get_local_specialty | 0 | Query asks specifically about washi paper making experiences in Gifu. Response returns traditional crafts (pottery/Mino Ware, lacquerware) b |
| L2-20 | get_spots | 0 | Query seeks fishing villages in Noto Peninsula, but response returns generic municipal pages from Komatsu City (transportation info, festiva |
| L2-21 | search_area | 1 | Query asked for lesser-known sand dunes beyond Tottori, but 84 results are dominated by Tottori Sakyu references in top positions. While the |
| L2-22 | get_local_specialty | 2 | Query asks for traditional crafts in San'in (山陰) region. Server returned 4 designated traditional crafts from Shimane prefecture with Chines |
| L2-23 | get_spots | 0 | The response returns completely unrelated content (library exhibitions, tourism manners, art shows, childcare center schedules) with no ment |
| L2-24 | get_spots | 0 | Query seeks traditional coffee towns in Kyushu, but tool returned generic Oita spots (WiFi services, campgrounds, observation decks, wholesa |
| L2-25 | get_hotels | 0 | Query asks for 古民家 (traditional folk houses) to stay in across Hokuriku region (multi-prefecture), but tool only searched Ishikawa hotels wi |
| L2-26 | get_japan_heritage | 0 | Query asks for mountain shrines in Kii Peninsula, but response returns whaling heritage sites and Wakanoura scenic spots. The relevant conte |
| L2-27 | get_festivals | 0 | Query asks for summer fireworks festivals along the Sea of Japan coast. Response returns UNESCO cultural heritage festivals from Niigata pre |
| L2-28 | get_local_specialty | 2 | Response correctly returns Beppu Bamboo Crafts (別府竹細工) as the primary result for Oita bamboo crafts. The item includes comprehensive metadat |
| L2-29 | get_spots | 0 | Query asks for cycling routes through rural Shikoku, but response returns ancient burial mounds, museums, and castle gates in Ehime. The too |
| L2-30 | get_traditional_arts | 1 | Response contains broad traditional arts data (183 items) but is not targeted to kabuki specifically. Includes Noh, festivals, and folk arts |
| L3-01 | get_festivals | 0 | The query asks for fireworks (花火大会), but get_festivals returns general traditional festivals (matsuri) with cultural designations. None of t |
| L3-02 | get_festivals | 0 | User wants to see fireworks (花火大会), but the tool returned general festivals (matsuri) without firework events. The response contains shrine  |
| L3-03 | get_festivals | 0 | Query asks for snow festivals but response returns 36 UNESCO heritage festivals filtered by Hokkaido, none related to snow festivals. Top re |
| L3-04 | get_japan_heritage | 0 | Query asks for rural/countryside living experiences in Japan. Tool returned Japan Heritage educational sites (schools, academies from Edo pe |
| L3-05 | search_area | 2 | Query asks for autumn foliage recommendations in Japan (Korean). Response returns 82 matches with highly relevant results: top entries inclu |
| L3-06 | search_area | 0 | Query seeks quiet meditation temples, tool searched '修行' (ascetic practice). Response returned 84 matches but top results are generic touris |
| L3-07 | search_area | 0 | Query seeks aurora viewing locations in Japan. Response returns 77 generic matches including business sites, tourism portals, DMO administra |
| L3-08 | get_hotels | 0 | Query asks for traditional 100-year-old houses (kominka 古民家) for accommodation. Response returns generic Gifu hotels including Route Inn cha |
| L3-09 | search_area | 0 | Query asks for 'hidden gem' cherry blossom spots with few tourists (Thai language). Tool returned generic municipality names (桜川市, 桜井市) and  |
| L3-10 | search_area | 1 | Query seeks dramatic landscapes for photography in Japan. Response contains 52 matches for '絶景' (spectacular views), but top results are mos |
| L3-11 | search_area | 1 | The query seeks outdoor natural hot springs (露天風呂 in nature, not hotels). Results include various onsen facilities with outdoor baths (須川温泉' |
| L3-12 | search_area | 0 | The response returns completely unrelated content. The user wants to swim with wild dolphins in Japan, but the results show a Kyoto cultural |
| L3-13 | get_japan_heritage | 0 | The query asks for traditional architecture and preservation districts (重伝建地区 specifically), but the tool called get_japan_heritage() return |
| L3-14 | search_area | 2 | Response contains highly relevant Ainu cultural experience content for Hokkaido. Top results include specific model courses for Ainu cultura |
| L3-15 | search_area | 1 | Response contains 85 matches for 磨崖仏 (cliff-carved Buddhist statues), but top results are poor quality. First result is Usuki Stone Buddhas  |
| L3-16 | search_area | 0 | Response contains Chinese/traditional Chinese content about Kumamoto/Kyushu volcanoes (Aso, Takachiho) hundreds of kilometers from Tokyo. Qu |
| L3-17 | search_area | 0 | Query asks for temple tofu-making experience in Indonesian. Response returns generic tourism pages (language selection menus, hotel listings |
| L3-18 | search_area | 1 | Query seeks 'fishing villages frozen in time' (historic, preserved fishing towns), but results are fish markets, modern beach spots, and gen |
| L3-19 | get_local_specialty | 1 | The tool returned 231 traditional crafts, but the top results show textiles (Nibutani Attus, Oitama Tsumugi, Ugo Shina Cloth) rather than wa |
| L3-20 | search_area | 2 | Query for 宿場 (post towns) returns highly relevant results. Top results include Yanagimachi (柳町), a preserved Edo-period post town on the Hok |
| L3-21 | search_area | 1 | Response contains 86 matches but top results are mostly generic navigation pages ('旅のプランニング', cookie policy notices) rather than actual beac |
| L3-22 | search_area | 0 | Query seeks small old-school izakaya alleys for drinking with locals, but tool returned generic tourism portal pages in Chinese/Traditional  |
| L3-23 | search_area | 2 | Query seeks rural Japan train travel experiences. Top result (小湊鉄道) is a canonical scenic local line with detailed description of rural land |
| L3-24 | search_area | 2 | Response contains multiple high-quality firefly viewing locations across Japan with specific details. Top results include Kitakyushu's firef |
| L3-25 | search_area | 1 | Query asks where to see cranes in winter in Japan. Response returns municipalities with '鶴' (crane) in their names (Tsuruta-cho, Tsurui-mura |
| L3-26 | search_area | 0 | Query was for shukubo (temple lodging) but results contain random tourist spots (Chinese ryokans in Iwate, Saga tourism pages, Zenkoji conte |
| L3-27 | search_area | 1 | Response contains relevant hot spring destinations including famous onsen villages (Nozawa Onsen, Shin-Onsen), but misses the specific yukat |
| L3-28 | search_area | 0 | Query asks for whale watching in Japan ("voir des baleines"). Response returns 87 generic tourism spots with no whale/whale-watching content |
| L3-29 | get_japan_heritage | 1 | The response returns valid Japan Heritage sites for Kyoto, including story #009 about 800-year tea history that mentions tea ceremony (茶道) a |
| L3-30 | search_area | 0 | The query asks for specific mountain villages with infrequent train service (every 2 hours), but the response returns generic administrative |
| L4-01 | get_local_food | 0 | Query asks for 'traditional food culture that hasn't gone mainstream yet' but tool returns GI-designated premium products like Kobe Beef, Yu |
| L4-02 | get_local_food | 1 | Query asks for lesser-known traditional food culture, but tool returned all 507 GI foods without filtering. Top results include very famous  |
| L4-03 | get_traditional_arts | 1 | The tool returns 183 traditional arts, which are culturally important, but the query seeks 'forgotten craftsman skills'—specific artisan tec |
| L4-04 | search_area | 0 | The query seeks Hokusai-like landscapes (Mt. Fuji views, coastal scenes). The response returns municipalities with '富士' in their names and g |
| L4-05 | get_japan_heritage | 0 | Query asks for lesser-known UNESCO sites, but the tool returned Japan Heritage (日本遺産) items, which are a completely different designation sy |
| L4-06 | search_area | 1 | Response contains 83 Jomon-related items but the top results are generic educational/museum pages and historical tourism content. The query  |
| L4-07 | get_local_food | 0 | Query asks about fermented food culture (发酵食品文化) across Japan. Response returns GI-designated foods (黑加仑, 但马牛, 神户牛肉, 夕张甜瓜, 玉露茶) which are pr |
| L4-08 | get_traditional_arts | 0 | The query asks for hidden mountain villages with shamanic traditions, but the tool returns a generic list of 183 traditional arts (Noh theat |
| L4-09 | search_area | 1 | Query seeks areas where nuclear bomb history is part of daily landscape (Hiroshima/Nagasaki). Response contains one relevant result (#4: Hir |
| L4-10 | get_local_specialty | 1 | Returns 231 METI traditional crafts with proper metadata (names, locations, descriptions), but doesn't identify towns specifically 'built ar |
| L4-11 | search_area | 1 | Response contains relevant industrial heritage content (明治日本の産業革命遺産 in Kagoshima, Nagoya industrial tourism, 富岡製糸場, etc.) addressing industr |
| L4-12 | get_japan_heritage | 0 | Query asks which region best shows Japan's religious diversity. The tool returned Japan Heritage Site #001 about education systems in Edo pe |
| L4-13 | get_festivals | 1 | Response returns 81 Important Intangible Folk Cultural Properties, which are endangered traditions. However, these are nationally designated |
| L4-14 | search_area | 1 | Query seeks coastal areas shaped by 2011 tsunami ten years on. Response includes relevant Tohoku earthquake/tsunami content (Kamaishi DMC me |
| L4-15 | search_area | 0 | Response contains generic tourism portal pages from Fukui, Miyazaki, and Yamagata prefectures with broad category navigation links. None add |
| L4-16 | get_japan_heritage | 0 | Query seeks Hidden Christian heritage, but response returns Nagasaki's Japan Heritage sites focused on border islands (Iki, Tsushima, Goto)  |
| L4-17 | search_area | 1 | Response contains genuine garden content (moss garden, Hoppō Cultural Museum with garden master Tanaka Taiami, garden road route), but fails |
| L4-18 | get_local_specialty | 1 | Response returns relevant craft items but focuses on weaving (織物) rather than dyeing techniques (染色). Top results like Nibutani Attus and Oi |
| L4-19 | search_area | 2 | The response returns 91 matches for '宿場' (post town) query. Top results include exactly what was requested: actual Edo-period highway post t |
| L4-20 | get_japan_heritage | 0 | Query asks for spiritual pilgrimages beyond Shikoku 88 (e.g., Kumano Kodo, Saikoku 33, Chichibu 34), but the tool returned Japan Heritage ed |
