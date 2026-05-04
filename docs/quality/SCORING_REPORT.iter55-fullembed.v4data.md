# v4-data Scoring Report — iter55-fullembed

**Cases scored**: 100

## KPIs (data-layer)

| KPI | Count | % |
|:---|---:|---:|
| Satisfaction (weighted ≥ 4.0)   | 27 | 27% |
| Minimum Acceptable (avg ≥ 3.0 + safe) | 75 | 75% |
| Catastrophic (NOT safe)          | 0 | 0% |

## Dimension averages (0–5)

| Dimension | Avg | Weight |
|:---|---:|---:|
| data_completeness | 2.80 | 0.25 |
| data_accuracy | 4.15 | 0.25 |
| schema_conformance | 3.72 | 0.10 |
| recall_of_known | 3.22 | 0.20 |
| prominence_ranking | 2.88 | 0.10 |
| traceability | 3.89 | 0.05 |
| structured_metadata | 3.25 | 0.05 |

## Bottom 15 cases (by weighted satisfaction)

- **L4-15** sat=1.30 | missing: Kaichi School (開智学校), Doukasha Hokkaido, Meiji Mura, Former Hokkaido Government Office | wrong:  | hint: 擬洋風 is too rare a keyword in scraped content; add it as a Wikidata category (P31=Q... pseudo-Western architecture) query; consider adding Meiji Mura and themed heritage buildings as indexed entities.
- **L3-28** sat=1.35 | missing: Ogasawara whale watching, Zamami whale watching, Tosa-Shimizu whale watching, Okinawa whale watching | wrong:  | hint: Add whale-watching spots as dedicated POI type; municipal scrape similarity matching for クジラ is producing noise—add topic filter for marine activities.
- **L3-30** sat=1.40 | missing: Iiyama Line villages, Tadami Line villages, Uchiko/Yodo rail villages, Kamiichi/Toyama local rail | wrong:  | hint: ローカル keyword matches website navigation text; add rail/transport entity type; index train-service villages from DMO itinerary data rather than relying on keyword match in web pages.
- **L3-07** sat=1.85 | missing: (aurora not viewable in Japan — correct response would be empty or redirected) | wrong:  | hint: Add impossibility/redirect metadata: when query maps to phenomenon not observable in Japan, emit a relevant_note or out_of_scope flag so the agent can inform the user accurately.
- **L3-03** sat=1.95 | missing: さっぽろ雪まつり (Sapporo Snow Festival) | wrong:  | hint: Scrape or add Sapporo Snow Festival and other Hokkaido winter festivals to the DB. national_heritage fallback should not surface non-Hokkaido items when prefecture filter is specified.
- **L1-03** sat=2.00 | missing: 南山城村, 南山城茶, 宇治茶 南山城, Minami-Yamashiro | wrong:  | hint: Add keyword routing: queries about specific villages/tea should try get_local_food or get_spots with municipality filter before get_japan_heritage; index 南山城茶 GI entry if it exists under MAFF
- **L1-12** sat=2.00 | missing: 弓浜絣, Yumihama-gasuri, 弓ヶ浜絣 | wrong:  | hint: Add category=craft to the Tottori specialty query; ensure METI densan items for Tottori (弓浜絣 craft_id likely 0231) are indexed; or route textile queries to get_local_specialty with explicit craft filter
- **L1-20** sat=2.00 | missing: 佐渡島, 佐渡金山, Sado Island, Sado Gold Mine | wrong:  | hint: Route Sado queries to search_area(q=佐渡) or get_spots(prefecture=Niigata, municipality=佐渡); ensure 佐渡金山 (Q557285, UNESCO WHS candidate) is in the attraction layer; add Sado Japan Heritage story if registered
- **L2-15** sat=2.10 | missing: 恵光院, 成慶院, 福智院, 一乗院 (Koyasan shukubo) | wrong:  | hint: Support municipality filter on get_hotels (e.g. municipality='高野山'); add lodging_type='shukubo' or 'temple_lodging'; index Koyasan temple lodging from municipal tourism sources.
- **L4-08** sat=2.10 | missing: Osorezan itako, Tono Yamabushi, Dewa Sanzan Shugendo, Haguro-san mountain asceticism | wrong:  | hint: get_traditional_arts needs keyword='山岳信仰' or category='mountain_worship'; add Shugendo and Yamabushi traditions as specific entities; use search_area('山岳信仰') for better coverage.
- **L3-26** sat=2.15 | missing: Koyasan shukubo, Eiheiji shukubo, Nikko shukubo, Yoshino shukubo | wrong:  | hint: Add keyword filter for 宿坊 among P31=temple or Q-type=monastery; surface Koyasan and Eiheiji as top results with qid and coordinates.
- **L1-09** sat=2.25 | missing: 熊野古道, Kumano Kodo, 中辺路, 小辺路, 大辺路, 伊勢路, 熊野三山 | wrong:  | hint: Index Kumano Kodo (UNESCO WHS Q672931) in attractions layer; get_japan_heritage results should surface 熊野参詣道 Japan Heritage story if it exists; add keyword routing to search_area for pilgrimage queries
- **L1-05** sat=2.35 | missing: 中芸ゆず, 馬路村ゆず, 中芸地区 | wrong:  | hint: Add keyword search parameter to get_local_food so agent can pass q=中芸ゆず to surface it ranked first; filter out scraped_local_food entries that are generic tourism page text rather than actual food items
- **L1-15** sat=2.40 | missing: 千光寺, 尾道市 (city entity), Onomichi cityscape | wrong: 大久野島毒ガス資料館 located in 竹原市 not 尾道市; 広島駅 address is 広島市南区 not 尾道 | hint: Fix municipality_code filtering for scraped spots — 342050 (Onomichi) should not include Takehara or Hiroshima city spots; add 千光寺 (Q3013285) to Wikidata layer
- **L2-07** sat=2.40 | missing: 八海山, 久保田, 〆張鶴, 越乃寒梅 (Niigata sake breweries) | wrong:  | hint: Add sake brewery data source or map sake GI (e.g. 新潟淡麗) to a searchable category; get_local_specialty should handle sake/酒蔵 as a category or the server should route to a brewery dataset.
