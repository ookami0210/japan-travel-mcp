# Test results digest (auto)


# L1 (20 cases)

## L1-01 [en] 但馬牛
**Query**: Tell me about Tajima beef from Hyogo, the origin of Kobe beef.
**Tool**: get_local_food({"prefecture": "Hyogo", "lang": "en"})
**Summary**: count=11, topic_hit=True
**First 5 items:**
  - [maff_gi] Tajima Beef (但馬牛) :: Carcass meat graded A or B, grade 2 or higher, produced by fattening Tajima catt ()
  - [maff_gi] Kobe Beef (神戸ビーフ) :: Carcass meat graded A or B grade 4 or higher and BMS No. 6 or higher, produced b ()
  - [maff_gi] Sayo Mochi Daizu (佐用もち大豆) :: A traditional variety of soybean with high glycinin (protein) content that devel ()
  - [maff_gi] Awajishima 3-nen Torafugu (淡路島3年とらふぐ) :: This tiger puffer fish (torafugu) is 1.5 to 2 times larger than typical farmed t ()
  - [maff_gi] Ibonoito (揖保乃糸) :: It is resistant to becoming soft after boiling, and has a smooth texture with a  ()

## L1-02 [ar] 但馬牛
**Query**: أخبرني عن لحم تاجيما في محافظة هيوغو، أصل لحم كوبي.
**Tool**: get_local_food({"prefecture": "Hyogo", "lang": "ar"})
**Summary**: count=11, topic_hit=True
**First 5 items:**
  - [maff_gi] لحم بقر تاجيما (但馬牛) :: لحم ذبيحة مصنَّف ضمن الفئة A أو B بدرجة 2 أو أعلى، يُنتج عن طريق تسمين أبقار تاج ()
  - [maff_gi] لحم بقر كوبي (神戸ビーフ) :: لحم الذبيحة المصنّف ضمن الدرجة A أو B 4 أو أعلى ومؤشر BMS رقم 6 أو أعلى، ويُنتج  ()
  - [maff_gi] ساو موتشي دايزو (佐用もち大豆) :: صنف تقليدي من فول الصويا يتميز بمحتوى عالٍ من الغليسينين (البروتين)، وعند تسخينه ()
  - [maff_gi] أواجيشيما 3-نين توراফوغو (淡路島3年とらふぐ) :: يُعدّ هذا السمكة من نوع توراफوغو (سمكة النفخ النمرية) أكبر بمقدار 1.5 إلى 2 ضعف  ()
  - [maff_gi] إيبونوإيتو (揖保乃糸) :: تتميز بمقاومتها للتفتت بعد السلق، وملمسها الناعم، وقوامها المتين مع قضمة نظيفة و ()

## L1-03 [en] 南山城村 茶畑
**Query**: Describe the tea fields of Minami-Yamashiro village in Kyoto. Just the village, not Uji.
**Tool**: get_japan_heritage({"prefecture": "Kyoto", "lang": "en"})
**Summary**: count=6, topic_hit=True
**First 5 items:**
  - [?] An 800-Year History Walk of Japanese Tea (日本茶800年の歴史散歩) :: Regarding the Japan Heritage portal site's entry on 'An 800-Year History Walk of ()
  - [?] Chinjufu: Yokosuka, Kure, Sasebo, Maizuru — Cities Where You Can Feel the Energy of Japan's Modernization (鎮守府　横須賀・呉・佐世保・舞鶴) :: About the Japan Heritage (Japan Heritage) portal site entry for Chinjufu — Yokos ()
  - [?] A Dreamworld Woven by Men Who Crossed Raging Waves: Kitamaebune Ports of Call and Shipowner Villages (荒波を越えた男たちの夢が紡いだ異空間) :: This is the Japan Heritage (Japan Heritage) portal site page on 'A Dreamworld Wo ()
  - [?] Tango Chirimen Corridor: 300 Years of Woven Silk (300年を紡ぐ絹が織り成す丹後ちりめん回廊) :: This entry on the Japan Heritage portal concerns the Tango Chirimen Corridor: 30 ()
  - [?] Japan's 1300-Year Journey of Preparing for Death: The Saigoku Thirty-Three Kannon Pilgrimage (1300年つづく日本の終活の旅) :: This is the Japan Heritage (Japan Heritage) portal site entry concerning the 130 ()

## L1-04 [es] 吉田の火祭り
**Query**: Háblame del Yoshida no Hi-Matsuri al pie del Monte Fuji.
**Tool**: get_festivals({"prefecture": "Yamanashi", "lang": "es"})
**Summary**: count=37, topic_hit=True
**First 5 items:**
  - [bunka_intangible] Festival del fuego de Yoshida (吉田の火祭) :: Festival celebrado en la ciudad de Fujiyoshida, prefectura de Yamanashi. ()
  - [unesco_japan] Dainichido Bugaku (大日堂舞楽) :: Arte escénico folclórico transmitido en el santuario Dainichireiki de la ciudad  ()
  - [unesco_japan] Hayachine Kagura (早池峰神楽) :: Un tipo de danza. ()
  - [unesco_japan] Festival Hikawa de Kawagoe (川越氷川祭) :: Festival del santuario Hikawa de Kawagoe, en la ciudad de Kawagoe, prefectura de ()
  - [unesco_japan] Festival Tatemon (たてもん祭り) :: Festival de verano celebrado en el santuario Suwa en la ciudad de Uozu, prefectu ()

## L1-05 [ja] 中芸ゆず
**Query**: 中芸地域の柚子について教えて
**Tool**: get_local_food({"prefecture": "Kochi", "lang": "ja"})
**Summary**: count=4, topic_hit=False
**First 5 items:**
  - [maff_gi] 物部ゆず (物部ゆず) :: キズが少なく外観が美しい、棚持ちの良い青果用に特化したゆず。青果用ゆずは栽培管理に手間がかかるため、全国平均の青果率は18%であるが、「物部ゆず」は69%（平成 ()
  - [scraped_local_food] グルメ (グルメ) ::  (高知県)
  - [scraped_local_food] アニメ映画「竜とそばかすの姫」で浅尾沈下橋が映画の舞台のモデルとなりました！

                                                    ～　ロケ地巡りや、観光で浅尾沈下橋を訪問される方へ　～ (アニメ映画「竜とそばかすの姫」で浅尾沈下橋が映画の舞台のモデルとなりました！

                                                    ～　ロケ地巡りや、観光で浅尾沈下橋を訪問される方へ　～) :: 高知県高岡郡越知町は高知県中央部に位置します。「自然と神秘と歴史浪漫あふれるまち」越知町をご紹介いたします。 (高知県)
  - [scraped_local_food] 越知町グルメ情報 (越知町グルメ情報) ::  (高知県)

## L1-06 [zh] 弘前公園桜
**Query**: 介绍一下青森县的弘前公园樱花。
**Tool**: get_spots({"prefecture": "Aomori", "municipality": "弘前"})
**Summary**: count=0, topic_hit=False

## L1-07 [ko] 出雲大社
**Query**: 이즈모다이샤 이즈모 타이샤에 대해 알려주세요.
**Tool**: search_area({"q": "出雲大社", "lang": "ko"})
**Summary**: count=20, topic_hit=True
**First 5 items:**
  - [wikidata] 木更津出雲大社 (木更津出雲大社) ::  (12)
  - [wikidata] 出雲大社上総分院 (出雲大社上総分院) ::  (12)
  - [wikidata] 出雲大社松山分祠 (出雲大社松山分祠) ::  (38)
  - [wikidata] 出雲大社福井分院 (出雲大社福井分院) ::  (18)
  - [wikidata] 出雲大社福岡分院 (出雲大社福岡分院) ::  (40)

## L1-08 [fr] 厳島神社
**Query**: Parle-moi du sanctuaire d'Itsukushima à Hiroshima.
**Tool**: search_area({"q": "厳島", "lang": "en"})
**Summary**: count=50, topic_hit=True
**First 5 items:**
  - [wikidata] 厳島神社 (厳島神社) ::  (12)
  - [wikidata] 厳島弁財天 (厳島弁財天) ::  (12)
  - [wikidata] 厳島神社 (厳島神社) ::  (12)
  - [wikidata] 厳島神社 (厳島神社) ::  (12)
  - [wikidata] 厳島神社 (厳島神社) ::  (12)

## L1-09 [de] 熊野古道
**Query**: Erzähl mir vom Kumano Kodo Pilgerweg.
**Tool**: get_japan_heritage({"prefecture": "Wakayama", "lang": "en"})
**Summary**: count=7, topic_hit=True
**First 5 items:**
  - [?] Living with Whales (鯨とともに生きる) :: About 'Living with Whales' on the Japan Heritage portal site. Since ancient time ()
  - [?] A Treasury of Scenic Beauty: Wakanoura (絶景の宝庫 和歌の浦) :: About Wakanoura on the Japan Heritage portal site. Wakanoura is centered on the  ()
  - [?] Kishu Yuasa: The Birthplace of Soy Sauce Brewing — 'The First Drop' (「最初の一滴」醤油醸造の発祥の地 紀州湯浅) :: This Japan Heritage story concerns Kishu Yuasa, recognized as the birthplace of  ()
  - [?] 'Peace for a Hundred Generations' — Hirokawa's Disaster-Prevention Heritage Where Memories of Tsunami and Recovery Live On (「百世の安堵」) :: Regarding 'Peace for a Hundred Generations' on the Japan Heritage Portal Site. T ()
  - [?] Japan's 1300-Year Journey of Preparing for Death: The Saigoku Thirty-Three Kannon Pilgrimage (1300年つづく日本の終活の旅) :: This is the Japan Heritage (Japan Heritage) portal site entry concerning the 130 ()

## L1-10 [ru] 姫路城
**Query**: Расскажи о замке Химэдзи.
**Tool**: search_area({"q": "姫路城", "lang": "en"})
**Summary**: count=0, topic_hit=False

## L1-11 [th] 文楽
**Query**: ขอข้อมูลเกี่ยวกับการแสดงบุนรากุที่โอซาก้า
**Tool**: get_traditional_arts({"lang": "th"})
**Summary**: count=183, topic_hit=False
**First 5 items:**
  - [?] โนกากุ (能楽) :: ศิลปะการแสดงดั้งเดิมของญี่ปุ่น เป็นคำเรียกรวมสำหรับโนห์ เคียวเง็น และศิลปะรูปแบบ ()
  - [?] เทศกาลคิฟุเนะ (貴船まつり) :: งานเทศกาลประจำปีหลักของศาลเจ้าคิฟุเนะในเมืองมานาซึรุ จังหวัดคานางาวะ ()
  - [?] เทศกาลโอคุมาคาบุโตะ (お熊甲祭) :: งานเทศกาลประจำปีของศาลเจ้าคุมาคาบุโตะ อาระกะชิฮิโกะ ตั้งอยู่ในเมืองนาเนา จังหวัด ()
  - [?] โยบุโกะ โอสึนาฮิกิ (呼子大綱引き) :: งานประเพณีดั้งเดิมที่สืบทอดกันมาในโยบุโกะมาจิ เมืองคาราสึ จังหวัดซางะ ()
  - [?] เทศกาลฮิกาวะแห่งคาวาโกเอะ (川越氷川祭) :: เทศกาลของศาลเจ้าฮิกาวะแห่งคาวาโกเอะ ในเมืองคาวาโกเอะ จังหวัดไซตามะ ()

## L1-12 [vi] 弓浜絣
**Query**: Hãy cho tôi biết về Yumihama Kasuri ở tỉnh Tottori.
**Tool**: get_local_specialty({"prefecture": "Tottori", "lang": "vi"})
**Summary**: count=7, topic_hit=True
**First 5 items:**
  - [?] Rakkyo cồn cát Tottori (鳥取砂丘らっきょう) :: Củ chắc, các vảy có độ dày gần như đồng đều, kết cấu giòn sảng khoái, và bề ngoà ()
  - [?] Bông cải xanh Daisen (大山ブロッコリー) :: Được đánh giá cao trên thị trường nhờ kiểm soát chất lượng chặt chẽ, hương vị ng ()
  - [?] Koge Hanagosho Kaki (こおげ花御所柿) :: Sản phẩm này sử dụng 'Hanagosho Kaki', một giống hồng địa phương từ thị trấn Kog ()
  - [?] Dưa hấu Daiei (⼤栄⻄⽠) :: Dưa hấu được chín hoàn toàn trong khoảng 48 ngày sau khi thụ phấn. Được thị trườ ()
  - [?] Hakushu Bijin (伯州美人) :: Phần trắng được làm trắng có thân dày và mềm mại, khi nấu chín có vị ngọt và tan ()

## L1-13 [tl] 直島
**Query**: Sabihin mo sa akin ang tungkol sa Naoshima Art Island.
**Tool**: search_area({"q": "直島", "lang": "en"})
**Summary**: count=3, topic_hit=True
**First 5 items:**
  - [municipality] 直島町 () ::  (香川県)
  - [wikidata] 直島新美術館 (直島新美術館) ::  (37)
  - [wikidata] ベネッセアートサイト直島 (ベネッセアートサイト直島) ::  (33)

## L1-14 [en] 角館 武家屋敷
**Query**: What is the Kakunodate samurai district in Akita?
**Tool**: get_spots({"prefecture": "Akita", "municipality": "角館"})
**Summary**: count=0, topic_hit=False

## L1-15 [id] 尾道
**Query**: Beritahu saya tentang Onomichi di Hiroshima.
**Tool**: get_spots({"prefecture": "Hiroshima", "municipality": "尾道"})
**Summary**: count=20, topic_hit=True
**First 5 items:**
  - [municipal_scrape] 注目ワード () ::  (広島県)
  - [municipal_scrape] 注目ワード () ::  (広島県)
  - [municipal_scrape] 注目ワード () ::  (広島県)
  - [municipal_scrape] 注目ワード () ::  (広島県)
  - [municipal_scrape] 注目ワード () ::  (広島県)

## L1-16 [es] 那智の滝
**Query**: ¿Qué es Nachi Falls en Wakayama?
**Tool**: search_area({"q": "那智", "lang": "en"})
**Summary**: count=5, topic_hit=True
**First 5 items:**
  - [wikidata] 熊野那智神社 (熊野那智神社) ::  (04)
  - [municipality] 那智勝浦町 () ::  (和歌山県)
  - [wikidata] 那智高原公園 (那智高原公園) ::  (30)
  - [wikidata] 熊野那智大社宝物殿 (熊野那智大社宝物殿) ::  (30)
  - [wikidata] 熊野那智大社 (熊野那智大社) ::  (30)

## L1-17 [hi] 知床半島
**Query**: मुझे होक्काइदो में शिरेतोको प्रायद्वीप के बारे में बताइए।
**Tool**: search_area({"q": "知床", "lang": "en"})
**Summary**: count=0, topic_hit=False

## L1-18 [en] 出羽三山
**Query**: Tell me about Dewa Sanzan in Yamagata.
**Tool**: search_area({"q": "出羽", "lang": "en"})
**Summary**: count=14, topic_hit=True
**First 5 items:**
  - [wikidata] 赤石館 (出羽国) (赤石館 (出羽国)) ::  (05)
  - [wikidata] 出羽神社 (出羽神社) ::  (12)
  - [wikidata] 出羽三山供養塔（三島神社） (出羽三山供養塔（三島神社）) ::  (14)
  - [wikidata] 出羽三山供養塔（円光寺） (出羽三山供養塔（円光寺）) ::  (14)
  - [wikidata] 出羽三山供養塔（宗泉寺） (出羽三山供養塔（宗泉寺）) ::  (14)

## L1-19 [pt] 屋久島
**Query**: Fale-me sobre a ilha de Yakushima.
**Tool**: search_area({"q": "屋久島", "lang": "en"})
**Summary**: count=6, topic_hit=True
**First 5 items:**
  - [municipality] 屋久島町 () ::  (鹿児島県)
  - [wikidata] 屋久島国立公園 (屋久島国立公園) ::  (46)
  - [wikidata] 屋久島世界遺産センター (屋久島世界遺産センター) ::  (46)
  - [wikidata] 屋久島町歴史民俗資料館 (屋久島町歴史民俗資料館) ::  (46)
  - [wikidata] 屋久島総合自然公園 (屋久島総合自然公園) ::  (46)

## L1-20 [ko] 佐渡島
**Query**: 사도섬에 대해 알려주세요.
**Tool**: get_japan_heritage({"prefecture": "Niigata", "lang": "ko"})
**Summary**: count=5, topic_hit=False
**First 5 items:**
  - [?] 에도 서민의 신앙과 행락의 땅 ～거대한 나무 태도를 메고 '오야마 참배'～ (江戸庶民の信仰と行楽の地) :: 일본유산(Japan Heritage) 포털 사이트의 에도 서민의 신앙과 행락의 땅에 관한 소개입니다. 오야마에 대한 신앙은 오래되어 나라 시대에 ()
  - [?] 「이게 뭐야！」 시나노강 유역의 화염형 토기와 설국의 문화 (「なんだ、コレは！」 信濃川流域の火焔型土器と雪国の文化) :: 일본유산（Japan Heritage）포털사이트의 「이게 뭐야！」 시나노강 유역의 화염형 토기와 설국의 문화에 대하여. 니가타현을 남쪽에서 북쪽으 ()
  - [?] 거친 파도를 넘은 남자들의 꿈이 엮어낸 이색 공간　～기타마에부네 기항지·선주 마을～ (荒波を越えた男たちの夢が紡いだ異空間) :: 일본유산（Japan Heritage）포털 사이트의 「거친 파도를 넘은 남자들의 꿈이 엮어낸 이색 공간」에 관한 페이지입니다. 에도 시대, 홋카이 ()
  - [?] 일본 와인 140년사 ～국산 포도로 양조하는 일본 문화의 결정～ (日本ワイン140年史) :: 일본 유산（Japan Heritage）포털 사이트의 일본 와인 140년사에 관하여. 메이지 시대 초, 일본의 근대화가 급속히 진행되는 가운데 정 ()
  - [?] 궁극의 설국 도카마치 — 진설! 폭설 지대 이야기 (究極の雪国とおかまち) :: 일본유산(Japan Heritage) 포털사이트의 '궁극의 설국 도카마치'에 대한 정보. 폭설 지대에서는 눈으로 대지가 덮이는 기간이 4월경까지 ()


# L2 (30 cases)

## L2-01 [en] 東北 秘湯ranges
**Query**: What are some traditional onsen ryokan in the Tohoku region?
**Tool**: get_hotels({"prefecture": "Akita"})
**Summary**: count=50, topic_hit=False
**First 5 items:**
  - [hotel] ANAクラウンプラザホテル秋田 () ::  (05)
  - [guest_house] HOTEL RADISH HOUSE () ::  (05)
  - [guest_house] towadako backpackers () ::  (05)
  - [apartment] グランデール有浦 () ::  (05)
  - [hotel] ホテル・プラザクリプトン (秋田県森林学習交流館) () ::  (05)

## L2-02 [ja] 四国遍路 宿坊
**Query**: 四国の「お遍路」で泊まれる宿坊を教えて
**Tool**: get_hotels({"prefecture": "Tokushima"})
**Summary**: count=50, topic_hit=False
**First 5 items:**
  - [guest_house] Togenkyo-Iya () ::  (36)
  - [hotel] いやしの温泉郷 () ::  (36)
  - [hotel] 三笠屋旅館 () ::  (36)
  - [hotel] 丸徳旅館 () ::  (36)
  - [hotel] 喜楽 () ::  (36)

## L2-03 [zh] 北海道 農業体験
**Query**: 推荐一些北海道的农家体验。
**Tool**: get_spots({"prefecture": "Hokkaido", "limit": 50})
**Summary**: count=50, topic_hit=True
**First 5 items:**
  - [municipal_scrape] 丘珠縄文遺跡体験学習館（おかだま縄文体験学習館） () ::  (北海道)
  - [municipal_scrape] 令和7年度補助金情報（観光関係） () ::  (北海道)
  - [municipal_scrape] 有限会社サクセス観光への監督処分（除却命令）について () ::  (北海道)
  - [municipal_scrape] さっぽろの遺跡（埋蔵文化財センター） () ::  (北海道)
  - [municipal_scrape] 観光・産業・ビジネス () ::  (北海道)

## L2-04 [en] 九州 陶芸窯元
**Query**: Where can I see traditional pottery being made in Kyushu?
**Tool**: get_local_specialty({"prefecture": "Saga", "category": "craft", "lang": "en"})
**Summary**: count=3, topic_hit=False
**First 5 items:**
  - [?] Hakata Ori (Hakata Weave) (博多織) :: The plain weave (hiraori) typified by "Kenjo Hakata" displays elegant and brilli ()
  - [?] Imari-Arita Ware (伊万里・有田焼) :: Imari-Arita Ware is characterized by its white and beautiful porcelain surface,  ()
  - [?] Karatsu Ware (唐津焼) :: The appeal of Karatsu ware lies in its earthy quality and unpretentious style. T ()

## L2-05 [ko] 東北 祭り
**Query**: 도호쿠 지방의 전통 축제를 알려주세요.
**Tool**: get_festivals({"prefecture": "Aomori", "lang": "ko"})
**Summary**: count=38, topic_hit=False
**First 5 items:**
  - [bunka_intangible] 하치노헤 산샤 타이사이 (八戸三社大祭) :: 아오모리현 하치노헤시에서 열리는 제례. ()
  - [bunka_intangible] 아오모리 네부타 (青森ねぶた) :: 일본 아오모리현 아오모리시에서 매년 8월에 개최되는 축제. ()
  - [unesco_japan] 다이니치도 부가쿠 (大日堂舞楽) :: 아키타현 가즈노시의 다이니치레이키 신사에 전해 내려오는 민속 예능. ()
  - [unesco_japan] 하야치네 가구라 (早池峰神楽) :: 춤의 한 종류. ()
  - [unesco_japan] 가와고에 히카와 마쓰리 (川越氷川祭) :: 사이타마현 가와고에시의 가와고에 히카와 신사의 제례. ()

## L2-06 [es] 東北 桜
**Query**: Lugares para ver cerezos en flor en Tohoku, no en Tokio.
**Tool**: get_spots({"prefecture": "Akita", "limit": 30})
**Summary**: count=30, topic_hit=False
**First 5 items:**
  - [municipal_scrape] トピックス () :: 秋田市公式サイト (秋田県)
  - [municipal_scrape] 4月25日（土曜日）から5月6日（水曜日）までゴールデンウイークイベントを開催します () :: 秋田市公式サイト (秋田県)
  - [municipal_scrape] 妊娠・出産 () :: 秋田市公式サイト (秋田県)
  - [municipal_scrape] 子育て () :: 秋田市公式サイト (秋田県)
  - [municipal_scrape] 入園・入学 () :: 秋田市公式サイト (秋田県)

## L2-07 [en] 新潟 酒蔵
**Query**: List the major sake breweries in Niigata prefecture.
**Tool**: get_local_specialty({"prefecture": "Niigata", "lang": "en"})
**Summary**: count=20, topic_hit=True
**First 5 items:**
  - [?] Kurosaki Chamame (くろさき茶豆) :: A distinctive color, aroma, and flavor derived from the Kodaira-kata chamame var ()
  - [?] Tsunan Snow-Buried Carrots (津南の雪下にんじん) :: Cultivated in Tsunan Town, one of Japan's leading heavy-snowfall areas, these ca ()
  - [?] Oguchi Renkon (大口れんこん) :: Strict shipping standards ensure that only lotus roots free of damage and with n ()
  - [?] Ugo Shina Cloth (羽越しな布) :: A woven fabric made from bast fibers derived from the bark of the Japanese linde ()
  - [?] Shiozawa Tsumugi (塩沢紬) :: The kasuri patterns formed by fine cross-shaped kasuri and tortoiseshell kasuri  ()

## L2-08 [fr] 白馬 スキー場+温泉
**Query**: Stations de ski avec sources thermales dans la région d'Hakuba.
**Tool**: get_spots({"prefecture": "Nagano", "municipality": "白馬"})
**Summary**: count=4, topic_hit=True
**First 5 items:**
  - [municipal_scrape] 白馬村がUN Tourismベスト・ツーリズム・ビレッジに選出されました () :: <ベスト・ツーリズム・ビレッジ申請の際に使用した白馬村紹介動画>https://youtu.be/z1LqBJpKCN8 (長野県)
  - [municipal_scrape] 景観・環境・観光 () :: 観光行政に関する内容はこちらをご覧ください。 (長野県)
  - [municipal_scrape] 観光課 () ::  (長野県)
  - [municipal_scrape] 観光商工係 () ::  (長野県)

## L2-09 [en] 関西 紅葉
**Query**: What are the best autumn foliage spots in the Kansai region?
**Tool**: get_spots({"prefecture": "Kyoto", "limit": 50})
**Summary**: count=50, topic_hit=False
**First 5 items:**
  - [municipal_scrape] 市民生活と観光の調和・両立の推進 () ::  (京都府)
  - [municipal_scrape] 観光振興（誘客誘致、受入環境整備等） () ::  (京都府)
  - [municipal_scrape] 【西京区制50周年記念事業】～阪急電鉄株式会社と連携～ 嵐山東周辺・松尾周辺の寺社などを巡る！まちあるきツアーの開催 （京都市観光協会「とっておきの京都」が後援） () ::  (京都府)
  - [municipal_scrape] 市民生活と観光の調和・両立の推進 () ::  (京都府)
  - [municipal_scrape] 観光振興（誘客誘致、受入環境整備等） () ::  (京都府)

## L2-10 [ar] 関西 桜
**Query**: ما هي الأماكن المشهورة بأزهار الكرز في كانساي؟
**Tool**: get_spots({"prefecture": "Nara", "limit": 30})
**Summary**: count=30, topic_hit=False
**First 5 items:**
  - [municipal_scrape] 奈良市の魅力 () :: 奈良市の魅力のページです。 (奈良県)
  - [municipal_scrape] 奈良市の観光情報 () ::  (奈良県)
  - [municipal_scrape] 奈良市東部の観光・民泊 () ::  (奈良県)
  - [municipal_scrape] 【4/25～】パークアンドライドサイクルライドで奈良の観光を楽しみませんか () ::  (奈良県)
  - [municipal_scrape] ふるさと納税で応援！2027年開催「奈良・サマルカンド特別交流展」 () ::  (奈良県)

## L2-11 [ja] 沖縄 星空
**Query**: 沖縄の離島で星空が綺麗な場所はどこ？
**Tool**: get_spots({"prefecture": "Okinawa", "limit": 50})
**Summary**: count=50, topic_hit=True
**First 5 items:**
  - [municipal_scrape] いざという時に () :: 那覇市公式ホームページ (沖縄県)
  - [municipal_scrape] いざという時に () :: 那覇市公式ホームページ (沖縄県)
  - [municipal_scrape] いざという時に () :: 那覇市公式ホームページ (沖縄県)
  - [municipal_scrape] いざという時に () :: 那覇市公式ホームページ (沖縄県)
  - [municipal_scrape] いざという時に () :: 那覇市公式ホームページ (沖縄県)

## L2-12 [th] 北海道 田舎 温泉
**Query**: ที่พักออนเซ็นในชนบทของฮอกไกโด
**Tool**: get_hotels({"prefecture": "Hokkaido"})
**Summary**: count=50, topic_hit=True
**First 5 items:**
  - [hotel] ANA ホリデイ・イン 札幌すすきの () ::  (01)
  - [hotel] ANAクラウンプラザホテル札幌 () ::  (01)
  - [hotel] ANAクラウンプラザホテル釧路 () ::  (01)
  - [apartment] Full Circle () ::  (01)
  - [apartment] Gondola Chalet () ::  (01)

## L2-13 [vi] 瀬戸内 島々
**Query**: Các đảo ở Biển nội địa Seto đáng ghé thăm.
**Tool**: get_spots({"prefecture": "Kagawa", "limit": 50})
**Summary**: count=50, topic_hit=False
**First 5 items:**
  - [municipal_scrape] 新着情報 () ::  (香川県)
  - [municipal_scrape] 高松市観光キャッチコピー「気持ち高まる、高松。」について () ::  (香川県)
  - [municipal_scrape] 観光情報 () ::  (香川県)
  - [municipal_scrape] 新着一覧 () ::  (香川県)
  - [municipal_scrape] さぬき高松まつり () ::  (香川県)

## L2-14 [en] 徳島 藍染
**Query**: Indigo dyeing workshops in Tokushima prefecture.
**Tool**: get_local_specialty({"prefecture": "Tokushima", "category": "craft", "lang": "en"})
**Summary**: count=3, topic_hit=True
**First 5 items:**
  - [?] Awa Hon-ai Shijira Weave (阿波正藍しじら織) ::  ()
  - [?] Otani Ware (大谷焼) :: Otani Ware is one of the representative ceramics of Shikoku, fired continuously  ()
  - [?] Awa Washi (阿波和紙) :: Awa Indigo-dyed washi is a plant-dyed paper product that possesses the natural o ()

## L2-15 [de] 高野山 宿坊
**Query**: Buddhistische Tempel mit Übernachtungsmöglichkeit (Shukubo) auf dem Berg Koya.
**Tool**: get_hotels({"prefecture": "Wakayama"})
**Summary**: count=50, topic_hit=False
**First 5 items:**
  - [hotel] HOTEL KII TANABE () ::  (30)
  - [hotel] HOTEL KII TANABE HANARE () ::  (30)
  - [guest_house] Myoji House () ::  (30)
  - [hotel] WAKAYAMA House (hotel) () ::  (30)
  - [hotel] ビジネスホテル 串本温泉 () ::  (30)

## L2-16 [en] 武家屋敷 地方
**Query**: Off-the-beaten-path samurai districts outside of Kyoto.
**Tool**: search_area({"q": "武家屋敷", "lang": "en"})
**Summary**: count=3, topic_hit=True
**First 5 items:**
  - [wikidata] 武家屋敷旧内山家 (武家屋敷旧内山家) ::  (18)
  - [wikidata] 会津武家屋敷 (会津武家屋敷) ::  (07)
  - [wikidata] 武家屋敷 (武家屋敷) ::  (32)

## L2-17 [id] 秋田 夏祭り
**Query**: Festival musim panas di prefektur Akita.
**Tool**: get_festivals({"prefecture": "Akita", "lang": "id"})
**Summary**: count=39, topic_hit=True
**First 5 items:**
  - [bunka_intangible] Dainichido Bugaku (大日堂舞楽) :: Seni pertunjukan rakyat yang diwariskan di Kuil Dainichireki di Kota Kazuno, Pre ()
  - [bunka_intangible] Festival Kakunodate (角館のお祭り) :: Festival kuil Shinmeisha dan aula Jojuin Yakushido di Kota Semboku, Prefektur Ak ()
  - [bunka_intangible] Prosesi Kereta Hias Festival Kuil Tsuchizaki Shinmeisha (土崎神明社祭の曳山行事) :: Festival tahunan Kuil Tsuchizaki Shinmeisha yang terletak di Kota Akita, Prefekt ()
  - [unesco_japan] Dainichido Bugaku (大日堂舞楽) :: Seni pertunjukan rakyat yang diwariskan di Kuil Dainichireiki di Kota Kazuno, Pr ()
  - [unesco_japan] Hayachine Kagura (早池峰神楽) :: Sejenis tarian. ()

## L2-18 [ko] 山陰 漁港 町
**Query**: 산인 지방의 작은 항구 마을.
**Tool**: get_spots({"prefecture": "Shimane", "limit": 50})
**Summary**: count=50, topic_hit=False
**First 5 items:**
  - [municipal_scrape] 観光・文化・スポーツ () ::  (島根県)
  - [municipal_scrape] 松江市役所新庁舎オープニングイベントを開催します () :: 松江市役所新庁舎は令和8年5月16日にグランドオープンを迎えます。グランドオープンを記念し、新庁舎を使用してイベントを開催します。当日は、こども向けイベント、マ (島根県)
  - [municipal_scrape] 松江市役所新庁舎内覧会を開催します () :: 松江市役所新庁舎は令和8年5月16日にグランドオープンを迎えます。グランドオープンを記念し、庁舎内覧会を開催します。みなさまのご来場をお待ちしております。イベン (島根県)
  - [municipal_scrape] 天文教室 () :: 4月22日に予定していた4月の天文教室（以下に掲載）は、雲が多く星が見えないため、開催を中止します。楽しみにされていた方におかれましては大変申し訳ございませんが (島根県)
  - [municipal_scrape] 令和8年度松江市歴史のまち歩き（募集） () :: 松江のまちの歴史や文化を楽しく歩きながら学んでみませんか。 (島根県)

## L2-19 [en] 岐阜 和紙
**Query**: Where can I experience washi paper making in Gifu?
**Tool**: get_local_specialty({"prefecture": "Gifu", "category": "craft", "lang": "en"})
**Summary**: count=9, topic_hit=True
**First 5 items:**
  - [?] Mino Ware (美濃焼) :: There are 15 types of Mino Ware designated as traditional crafts. Among them, Sh ()
  - [?] Hidehira-nuri (秀衡塗) :: The base coat uses honkataji, considered the most durable foundation. The decora ()
  - [?] Hida Shunkei (飛騨春慶) :: The bending technique used to shape boards into three-dimensional forms is parti ()
  - [?] Nagiso Rokuro Zaiku (Nagiso Lathe Work) (南木曽ろくろ細工) :: The appeal of Nagiso Rokuro Zaiku lies in making the most of the natural wood gr ()
  - [?] Ichii Ittobori (Ichii Wood Single-Knife Carving) (一位一刀彫) :: These carvings make full use of the natural characteristics of the wood without  ()

## L2-20 [es] 能登 漁村
**Query**: Pueblos de pescadores en la península de Noto.
**Tool**: get_spots({"prefecture": "Ishikawa", "limit": 50})
**Summary**: count=50, topic_hit=True
**First 5 items:**
  - [municipal_scrape] 観光・イベント () ::  (石川県)
  - [municipal_scrape] 令和8年度七尾市地域おこし協力隊の募集（観光・地域資源を活用した経済の活性化及び発展） () ::  (石川県)
  - [municipal_scrape] 合宿・教育旅行・コンベンション・スポーツ大会などの補助金制度 () ::  (石川県)
  - [municipal_scrape] 七尾の観光（七尾おでかけガイド） () ::  (石川県)
  - [municipal_scrape] 七尾のイベント () ::  (石川県)

## L2-21 [en] 砂丘 全国
**Query**: Lesser-known sand dunes in Japan, not just Tottori.
**Tool**: search_area({"q": "砂丘", "lang": "en"})
**Summary**: count=0, topic_hit=False

## L2-22 [zh] 山陰 工芸
**Query**: 山阴地区的传统工艺品。
**Tool**: get_local_specialty({"prefecture": "Shimane", "category": "craft", "lang": "zh"})
**Summary**: count=4, topic_hit=True
**First 5 items:**
  - [?] 石见烧 (石見焼) :: 主要产品使用接近瓷器的黏土，施以由含铁当地石料制成的茶褐色釉药，或由含碱性石料制成的透明釉药。透明釉在完全燃烧的火焰中烧制呈黄土色，在不完全燃烧的火焰中烧制则呈 ()
  - [?] 石州和纸 (石州和紙) :: 楮纸纤维长，是最为强韧的纸。三桠纸细腻、有弹性，带有柔和的光泽。雁皮纸最为精细，有光泽，且耐虫害。产量最多的楮纸曾被商人用于记账，其坚韧程度甚至在火灾时投入井中 ()
  - [?] 云州算盘 (雲州そろばん) :: 算盘最重要的部件是算珠。算珠移动顺畅、发出清脆响亮声音的算盘可以称为优质算盘。尤其是算珠孔的打磨和芯杆的精加工均经过精心处理，因此使用越久越顺手。 ()
  - [?] 出云石灯笼 (出雲石燈ろう) :: 由于原石石质细密、颗粒紧实，成品作品高雅柔和、造型优美。色调优良，且苔藓易于附着，很快便呈现出古朴色泽，与自然环境相得益彰。此外，其耐寒耐热性强，历经多年风化而 ()

## L2-23 [en] 北海道 ラベンダー
**Query**: What lavender fields exist in Hokkaido beyond Furano?
**Tool**: get_spots({"prefecture": "Hokkaido", "limit": 50})
**Summary**: count=50, topic_hit=True
**First 5 items:**
  - [municipal_scrape] 丘珠縄文遺跡体験学習館（おかだま縄文体験学習館） () ::  (北海道)
  - [municipal_scrape] 令和7年度補助金情報（観光関係） () ::  (北海道)
  - [municipal_scrape] 有限会社サクセス観光への監督処分（除却命令）について () ::  (北海道)
  - [municipal_scrape] さっぽろの遺跡（埋蔵文化財センター） () ::  (北海道)
  - [municipal_scrape] 観光・産業・ビジネス () ::  (北海道)

## L2-24 [tl] 九州 古い町並み
**Query**: Mga tradisyonal na bayan ng kape sa Kyushu.
**Tool**: get_spots({"prefecture": "Oita", "limit": 50})
**Summary**: count=50, topic_hit=False
**First 5 items:**
  - [municipal_scrape] トヨタカローラ大分 祝祭の広場などのイベント情報をお知らせします () :: トヨタカローラ大分 祝祭の広場などのイベント情報をお知らせします (大分県)
  - [municipal_scrape] 刊行物（文化財） () ::  (大分県)
  - [municipal_scrape] 観光ガイド () ::  (大分県)
  - [municipal_scrape] 大分の観光 () ::  (大分県)
  - [municipal_scrape] 観光文化姉妹都市 () ::  (大分県)

## L2-25 [ja] 北陸 古民家
**Query**: 北陸地方で泊まれる古民家を教えて
**Tool**: get_hotels({"prefecture": "Ishikawa"})
**Summary**: count=50, topic_hit=False
**First 5 items:**
  - [hostel] ? () ::  (17)
  - [hotel] AB HOTEL () ::  (17)
  - [hotel] ANAクラウンプラザホテル金沢 () ::  (17)
  - [guest_house] かなや () ::  (17)
  - [hotel] すゞや今日楼 () ::  (17)

## L2-26 [en] 紀伊半島 山岳信仰
**Query**: Mountain shrines in the Kii Peninsula.
**Tool**: get_japan_heritage({"prefecture": "Wakayama", "lang": "en"})
**Summary**: count=7, topic_hit=True
**First 5 items:**
  - [?] Living with Whales (鯨とともに生きる) :: About 'Living with Whales' on the Japan Heritage portal site. Since ancient time ()
  - [?] A Treasury of Scenic Beauty: Wakanoura (絶景の宝庫 和歌の浦) :: About Wakanoura on the Japan Heritage portal site. Wakanoura is centered on the  ()
  - [?] Kishu Yuasa: The Birthplace of Soy Sauce Brewing — 'The First Drop' (「最初の一滴」醤油醸造の発祥の地 紀州湯浅) :: This Japan Heritage story concerns Kishu Yuasa, recognized as the birthplace of  ()
  - [?] 'Peace for a Hundred Generations' — Hirokawa's Disaster-Prevention Heritage Where Memories of Tsunami and Recovery Live On (「百世の安堵」) :: Regarding 'Peace for a Hundred Generations' on the Japan Heritage Portal Site. T ()
  - [?] Japan's 1300-Year Journey of Preparing for Death: The Saigoku Thirty-Three Kannon Pilgrimage (1300年つづく日本の終活の旅) :: This is the Japan Heritage (Japan Heritage) portal site entry concerning the 130 ()

## L2-27 [en] 日本海 花火
**Query**: Summer fireworks festivals along the Sea of Japan coast.
**Tool**: get_festivals({"prefecture": "Niigata", "lang": "en"})
**Summary**: count=36, topic_hit=False
**First 5 items:**
  - [unesco_japan] Dainichido Bugaku (大日堂舞楽) :: A folk performing art passed down at Dainichireiki Shrine in Kazuno City, Akita  ()
  - [unesco_japan] Hayachine Kagura (早池峰神楽) :: A type of dance. ()
  - [unesco_japan] Kawagoe Hikawa Festival (川越氷川祭) :: Festival of Kawagoe Hikawa Shrine in Kawagoe City, Saitama Prefecture. ()
  - [unesco_japan] Tatemon Festival (たてもん祭り) :: A summer festival held at Suwa Shrine in Uozu City, Toyama Prefecture. ()
  - [unesco_japan] Ueno Tenjin Festival (上野天神祭) :: An autumn festival held at Sugawara Shrine in Iga City, Mie Prefecture. ()

## L2-28 [en] 大分 竹工芸
**Query**: Traditional bamboo crafts in Oita prefecture.
**Tool**: get_local_specialty({"prefecture": "Oita", "category": "craft", "lang": "en"})
**Summary**: count=2, topic_hit=True
**First 5 items:**
  - [?] Hakata Ori (Hakata Weave) (博多織) :: The plain weave (hiraori) typified by "Kenjo Hakata" displays elegant and brilli ()
  - [?] Beppu Bamboo Crafts (別府竹細工) :: The primary material used in Beppu Bamboo Crafts is Madake bamboo grown in Oita  ()

## L2-29 [en] 四国 サイクリング
**Query**: Cycling routes through rural Shikoku.
**Tool**: get_spots({"prefecture": "Ehime", "limit": 50})
**Summary**: count=50, topic_hit=False
**First 5 items:**
  - [municipal_scrape] 【4月27日】新造船の岩城橋下通過について () ::  (愛媛県)
  - [municipal_scrape] サイクリングしまなみ2026　4月13日～順次エントリー開始 () :: サイクリングしまなみ2026が10月25日（日曜日）に開催されます！ (愛媛県)
  - [municipal_scrape] 【延長決定！】かみじまサイクルフリーで上島町へ行こう！～観光客専用自転車船賃無料化事業～ () ::  (愛媛県)
  - [municipal_scrape] 上島町企業誘致促進条例が一部改正されました () ::  (愛媛県)
  - [municipal_scrape] 上島町ライブカメラ () ::  (愛媛県)

## L2-30 [en] 地方 歌舞伎
**Query**: Where to see traditional kabuki outside of Tokyo and Kyoto.
**Tool**: get_traditional_arts({"lang": "en"})
**Summary**: count=183, topic_hit=False
**First 5 items:**
  - [?] Nogaku (能楽) :: A traditional performing art of Japan. A collective term for Noh, Kyogen, and re ()
  - [?] Kifune Festival (貴船まつり) :: The annual grand festival of Kifune Shrine in Manazuru Town, Kanagawa Prefecture ()
  - [?] Okumakabuto Festival (お熊甲祭) :: The annual festival of Kumakabuto Aragakashihiko Shrine, located in Nanao City,  ()
  - [?] Yobuko Otsunahiki (呼子大綱引き) :: A traditional event passed down in Yobuko-machi, Karatsu City, Saga Prefecture. ()
  - [?] Kawagoe Hikawa Festival (川越氷川祭) :: The festival of Kawagoe Hikawa Shrine in Kawagoe City, Saitama Prefecture. ()


# L3 (30 cases)

## L3-01 [en] 花火大会
**Query**: I want to see fireworks in Japan.
**Tool**: get_festivals({"lang": "en"})
**Summary**: count=81, topic_hit=False
**First 5 items:**
  - [bunka_intangible] Kifune Festival (貴船まつり) :: The annual grand festival of Kifune Shrine in Manazuru Town, Kanagawa Prefecture ()
  - [bunka_intangible] Okumakabuto Festival (お熊甲祭) :: The annual festival of Kumakabuto Aragakashihiko Shrine, located in Nanao City,  ()
  - [bunka_intangible] Kawagoe Hikawa Festival (川越氷川祭) :: The festival of Kawagoe Hikawa Shrine in Kawagoe City, Saitama Prefecture. ()
  - [bunka_intangible] Tatemon Festival (たてもん祭り) :: A summer festival held at Suwa Shrine in Uozu City, Toyama Prefecture. ()
  - [bunka_intangible] Yasurai Festival (やすらい祭) ::  ()

## L3-02 [ja] 花火大会
**Query**: 日本で花火を見てみたい。
**Tool**: get_festivals({"lang": "ja"})
**Summary**: count=81, topic_hit=False
**First 5 items:**
  - [bunka_intangible] 貴船まつり (貴船まつり) :: 神奈川県真鶴町の貴船神社の例大祭 ()
  - [bunka_intangible] お熊甲祭 (お熊甲祭) :: 石川県七尾市にある久麻加夫都阿良加志比古神社の例祭 ()
  - [bunka_intangible] 川越氷川祭 (川越氷川祭) :: 埼玉県川越市の川越氷川神社の祭礼 ()
  - [bunka_intangible] たてもん祭り (たてもん祭り) :: 富山県魚津市の諏訪神社の夏季祭礼 ()
  - [bunka_intangible] やすらい祭 (やすらい祭) ::  ()

## L3-03 [en] 雪祭り
**Query**: Where can I experience snow festivals in Japan?
**Tool**: get_festivals({"prefecture": "Hokkaido", "lang": "en"})
**Summary**: count=36, topic_hit=False
**First 5 items:**
  - [unesco_japan] Dainichido Bugaku (大日堂舞楽) :: A folk performing art passed down at Dainichireiki Shrine in Kazuno City, Akita  ()
  - [unesco_japan] Hayachine Kagura (早池峰神楽) :: A type of dance. ()
  - [unesco_japan] Kawagoe Hikawa Festival (川越氷川祭) :: Festival of Kawagoe Hikawa Shrine in Kawagoe City, Saitama Prefecture. ()
  - [unesco_japan] Tatemon Festival (たてもん祭り) :: A summer festival held at Suwa Shrine in Uozu City, Toyama Prefecture. ()
  - [unesco_japan] Ueno Tenjin Festival (上野天神祭) :: An autumn festival held at Sugawara Shrine in Iga City, Mie Prefecture. ()

## L3-04 [zh] 田舎暮らし体験
**Query**: 我想在日本体验真正的乡村生活。
**Tool**: get_japan_heritage({"lang": "zh"})
**Summary**: count=104, topic_hit=True
**First 5 items:**
  - [?] 近世日本的教育遗产群　求学之心与礼节之本源 (近世日本の教育遺産群) :: 关于日本遗产（Japan Heritage）门户网站上的近世日本教育遗产群：访问近世日本的外国人在游记中记录了日本人的种种面貌。 ()
  - [?] 女当家——群马的丝绸故事 (かかあ天下) :: 关于日本遗产（Japan Heritage）门户网站上的「女当家」。上州的农家中，沉睡着世代精心珍藏的丝绸和服。（原文不完整） ()
  - [?] 与加贺前田家渊源深厚的町民文化盛开之城高冈　——人、技、心—— (加賀前田家ゆかりの町民文化が花咲くまち高岡) :: 这是日本遗产（Japan Heritage）门户网站中关于「与加贺前田家渊源深厚的町民文化盛开之城高冈」的介绍。高冈背靠北陆地区具有代表性的粮仓地带，北面朝向富 ()
  - [?] 灯火飞舞的半岛　能登　～狂热的切子灯笼祭～ (灯（あか）り舞う半島　能登) :: 关于日本遗产（Japan Heritage）门户网站中「灯火飞舞的半岛　能登」的介绍。石川县位于日本列岛大致中央位置，能登半岛突出于日本海之中。 ()
  - [?] 连接大海与都城的若狭往来文化遗产群　～御食国（みけつくに）若狭与鲭鱼街道～ (海と都をつなぐ若狭の往来文化遺産群) :: 若狭濒临日本海，自然资源丰富。古代，若狭向都城供应海产品和盐。此日本遗产故事介绍了连接若狭与都城的往来路线上的文化遗产群，内容来自日本遗产门户网站。 ()

## L3-05 [ko] 紅葉
**Query**: 일본에서 단풍을 즐길 수 있는 곳을 추천해 주세요.
**Tool**: search_area({"q": "紅葉", "lang": "ko"})
**Summary**: count=7, topic_hit=True
**First 5 items:**
  - [wikidata] 紅葉八幡宮 (紅葉八幡宮) ::  (40)
  - [wikidata] 紅葉山公園 (紅葉山公園) ::  (07)
  - [wikidata] 紅葉谷川庭園砂防施設 (紅葉谷川庭園砂防施設) ::  (34)
  - [wikidata] 紅葉谷公園 (紅葉谷公園) ::  (34)
  - [wikidata] 紅葉ケ丘公園 (紅葉ケ丘公園) ::  (14)

## L3-06 [en] 静かな寺 修行
**Query**: I want a quiet place to meditate in Japan, not a touristy temple.
**Tool**: search_area({"q": "修行", "lang": "en"})
**Summary**: count=0, topic_hit=False

## L3-07 [es] オーロラ Japan
**Query**: Quiero ver auroras boreales en Japón.
**Tool**: search_area({"q": "オーロラ", "lang": "es"})
**Summary**: count=0, topic_hit=False

## L3-08 [en] 古民家 宿泊
**Query**: Where can I sleep in a 100-year-old house in Japan?
**Tool**: get_hotels({"prefecture": "Gifu"})
**Summary**: count=50, topic_hit=False
**First 5 items:**
  - [apartment] Airbnb Omotenashi Teru House () ::  (21)
  - [hostel] AOI SUITE TAKAYAMA () ::  (21)
  - [hotel] Oyado koto no yume () ::  (21)
  - [hotel] ホテル穂高 () ::  (21)
  - [hotel] ルートイン () ::  (21)

## L3-09 [th] 桜 穴場
**Query**: สถานที่ใหม่นอกจากการท่องเที่ยวที่ไม่มีนักท่องเที่ยว
**Tool**: search_area({"q": "桜", "lang": "th"})
**Summary**: count=50, topic_hit=False
**First 5 items:**
  - [wikidata] 桜塚古墳 (桜塚古墳) ::  (23)
  - [wikidata] 桜天神社 (桜天神社) ::  (23)
  - [wikidata] 桜形神社 (桜形神社) ::  (23)
  - [wikidata] 桜神明社 (桜神明社) ::  (23)
  - [wikidata] 桜木公園 (名古屋市) (桜木公園 (名古屋市)) ::  (23)

## L3-10 [en] 絶景 写真
**Query**: I love photography. Where in Japan has the most dramatic landscapes?
**Tool**: search_area({"q": "絶景", "lang": "en"})
**Summary**: count=0, topic_hit=False

## L3-11 [ar] 露天風呂 自然
**Query**: أريد تجربة حمامات الينابيع الساخنة في الطبيعة، لا في الفنادق.
**Tool**: search_area({"q": "露天風呂", "lang": "ar"})
**Summary**: count=0, topic_hit=False

## L3-12 [en] 野生イルカ 体験
**Query**: I want to swim with wild dolphins in Japan.
**Tool**: search_area({"q": "イルカ", "lang": "en"})
**Summary**: count=0, topic_hit=False

## L3-13 [en] 重伝建地区
**Query**: Best places in Japan to see traditional architecture untouched by modernization.
**Tool**: get_japan_heritage({"lang": "en"})
**Summary**: count=104, topic_hit=False
**First 5 items:**
  - [?] Early Modern Japan's Educational Heritage: The Roots of a Desire to Learn and of Etiquette (近世日本の教育遺産群) :: Regarding the early modern Japan educational heritage sites on the Japan Heritag ()
  - [?] Kakaa Tenka: The Silk Story of Gunma (かかあ天下) :: Regarding Kakaa Tenka on the Japan Heritage portal site. In the farmhouses of Jo ()
  - [?] Takaoka — A Town Where Civic Culture Rooted in the Kaga Maeda Clan Flourishes: People, Craft, and Spirit (加賀前田家ゆかりの町民文化が花咲くまち高岡) :: This is the Japan Heritage (Japan Heritage) portal site entry for Takaoka, a tow ()
  - [?] The Lantern-Dancing Peninsula: Noto — Festival of Kiriko Frenzy (灯（あか）り舞う半島　能登) :: About the Japan Heritage (Japan Heritage) portal site entry for 'The Lantern-Dan ()
  - [?] Wakasa's Cultural Heritage of Exchange Connecting the Sea and the Capital — Miketsukuni Wakasa and the Saba Kaido (海と都をつなぐ若狭の往来文化遺産群) :: Wakasa, facing the Sea of Japan and blessed with abundant nature, supplied seafo ()

## L3-14 [vi] アイヌ文化 体験
**Query**: Tôi muốn trải nghiệm văn hóa Ainu ở Hokkaido.
**Tool**: search_area({"q": "アイヌ", "lang": "vi"})
**Summary**: count=0, topic_hit=False

## L3-15 [en] 磨崖仏
**Query**: Where can I find Buddhist statues carved into cliffs in Japan?
**Tool**: search_area({"q": "磨崖仏", "lang": "en"})
**Summary**: count=2, topic_hit=True
**First 5 items:**
  - [wikidata] 大岩弘法院磨崖仏 (大岩弘法院磨崖仏) ::  (40)
  - [wikidata] 白山道奥磨崖仏 (白山道奥磨崖仏) ::  (14)

## L3-16 [en] 火山 日帰り
**Query**: Volcano hikes you can do in a single day from Tokyo.
**Tool**: search_area({"q": "火山", "lang": "en"})
**Summary**: count=7, topic_hit=True
**First 5 items:**
  - [wikidata] 浅間火山博物館 (浅間火山博物館) ::  (10)
  - [wikidata] 桜島国際火山砂防センター (桜島国際火山砂防センター) ::  (46)
  - [wikidata] 阿蘇火山博物館 (阿蘇火山博物館) ::  (43)
  - [wikidata] 畝火山口神社 (畝火山口神社) ::  (29)
  - [wikidata] 松代泥火山 (松代泥火山) ::  (15)

## L3-17 [id] 寺 豆腐 体験
**Query**: Saya ingin makan tofu yang baru dibuat di kuil.
**Tool**: search_area({"q": "豆腐", "lang": "id"})
**Summary**: count=0, topic_hit=False

## L3-18 [en] 古い漁港
**Query**: I want to see fishing villages frozen in time.
**Tool**: search_area({"q": "漁港", "lang": "en"})
**Summary**: count=0, topic_hit=False

## L3-19 [en] 和紙 職人 体験
**Query**: Where can I learn traditional Japanese paper making from a master?
**Tool**: get_local_specialty({"category": "craft", "lang": "en"})
**Summary**: count=231, topic_hit=True
**First 5 items:**
  - [?] Nibutani Attus (二風谷アットゥㇱ) :: Attus refers to a woven textile made using thread spun from the bark fibers of t ()
  - [?] Oitama Tsumugi (置賜紬) :: Oitama Tsumugi is the collective name for all textiles produced in this region.  ()
  - [?] Ugo Shina Cloth (羽越しな布) :: A woven fabric made from bast fibers derived from the bark of the Japanese linde ()
  - [?] Yuki Tsumugi (結城紬) :: Because the thread is drawn by hand from silk wadding (mawata), each of the one  ()
  - [?] Isesaki Kasuri (伊勢崎絣) :: Because the fabric is produced through numerous processes centered on handwork,  ()

## L3-20 [ja] 時代劇ロケ地
**Query**: まるで時代劇のような景色の場所に行きたい。
**Tool**: search_area({"q": "宿場", "lang": "ja"})
**Summary**: count=0, topic_hit=False

## L3-21 [en] 穴場 ビーチ
**Query**: Beaches in Japan that aren't crowded with tourists.
**Tool**: search_area({"q": "ビーチ", "lang": "en"})
**Summary**: count=2, topic_hit=False
**First 5 items:**
  - [wikidata] 南知多ビーチランド (南知多ビーチランド) ::  (23)
  - [wikidata] 大磯ロングビーチ (大磯ロングビーチ) ::  (14)

## L3-22 [en] ローカル 居酒屋 横丁
**Query**: Where can I drink with locals at a small old-school izakaya?
**Tool**: search_area({"q": "横丁", "lang": "en"})
**Summary**: count=5, topic_hit=True
**First 5 items:**
  - [wikidata] なにわ食いしんぼ横丁 (なにわ食いしんぼ横丁) ::  (27)
  - [wikidata] 御徒町らーめん横丁 (御徒町らーめん横丁) ::  (13)
  - [wikidata] 福袋デザート横丁 (福袋デザート横丁) ::  (13)
  - [wikidata] 横丁公園 (横丁公園) ::  (13)
  - [wikidata] はい!からっと横丁 (はい!からっと横丁) ::  (35)

## L3-23 [de] ローカル線 観光
**Query**: Ich möchte mit der Bahn durch ländliches Japan fahren.
**Tool**: search_area({"q": "ローカル線", "lang": "de"})
**Summary**: count=0, topic_hit=False

## L3-24 [en] ホタル
**Query**: Places in Japan to see firefly viewing in summer.
**Tool**: search_area({"q": "ホタル", "lang": "en"})
**Summary**: count=2, topic_hit=False
**First 5 items:**
  - [wikidata] ホタルの里 (ホタルの里) ::  (28)
  - [wikidata] 豊田ホタルの里ミュージアム (豊田ホタルの里ミュージアム) ::  (35)

## L3-25 [ru] ツル 越冬
**Query**: Где в Японии можно увидеть журавлей зимой?
**Tool**: search_area({"q": "鶴", "lang": "ru"})
**Summary**: count=50, topic_hit=False
**First 5 items:**
  - [wikidata] 鶴舞駅名大病院口 (鶴舞駅名大病院口) ::  (23)
  - [wikidata] 鶴舞公園奏楽堂 (鶴舞公園奏楽堂) ::  (23)
  - [wikidata] 鶴舞公園 (鶴舞公園) ::  (23)
  - [municipality] 鶴田町 () ::  (青森県)
  - [wikidata] 丹頂鶴自然公園 (丹頂鶴自然公園) ::  (02)

## L3-26 [en] 宿坊 体験
**Query**: I want to spend the night in a Buddhist temple.
**Tool**: search_area({"q": "宿坊", "lang": "en"})
**Summary**: count=0, topic_hit=False

## L3-27 [en] 温泉街 浴衣
**Query**: Quiet hot spring villages where you can walk in yukata between baths.
**Tool**: search_area({"q": "温泉", "lang": "en"})
**Summary**: count=50, topic_hit=False
**First 5 items:**
  - [wikidata] かすみ温泉 (かすみ温泉) ::  (05)
  - [wikidata] 山の手温泉 (山の手温泉) ::  (05)
  - [wikidata] 鴨川温泉郷 (鴨川温泉郷) ::  (12)
  - [wikidata] たてやま温泉郷 (たてやま温泉郷) ::  (12)
  - [wikidata] 玉梨温泉 (玉梨温泉) ::  (07)

## L3-28 [fr] クジラ ホエールウォッチング
**Query**: Je voudrais voir des baleines au Japon.
**Tool**: search_area({"q": "クジラ", "lang": "fr"})
**Summary**: count=1, topic_hit=False
**First 5 items:**
  - [wikidata] 道徳公園クジラ池噴水 (道徳公園クジラ池噴水) ::  (23)

## L3-29 [en] 茶道 本格 体験
**Query**: Where can I experience the traditional Japanese tea ceremony deeply, not as a tourist show?
**Tool**: get_japan_heritage({"prefecture": "Kyoto", "lang": "en"})
**Summary**: count=6, topic_hit=True
**First 5 items:**
  - [?] An 800-Year History Walk of Japanese Tea (日本茶800年の歴史散歩) :: Regarding the Japan Heritage portal site's entry on 'An 800-Year History Walk of ()
  - [?] Chinjufu: Yokosuka, Kure, Sasebo, Maizuru — Cities Where You Can Feel the Energy of Japan's Modernization (鎮守府　横須賀・呉・佐世保・舞鶴) :: About the Japan Heritage (Japan Heritage) portal site entry for Chinjufu — Yokos ()
  - [?] A Dreamworld Woven by Men Who Crossed Raging Waves: Kitamaebune Ports of Call and Shipowner Villages (荒波を越えた男たちの夢が紡いだ異空間) :: This is the Japan Heritage (Japan Heritage) portal site page on 'A Dreamworld Wo ()
  - [?] Tango Chirimen Corridor: 300 Years of Woven Silk (300年を紡ぐ絹が織り成す丹後ちりめん回廊) :: This entry on the Japan Heritage portal concerns the Tango Chirimen Corridor: 30 ()
  - [?] Japan's 1300-Year Journey of Preparing for Death: The Saigoku Thirty-Three Kannon Pilgrimage (1300年つづく日本の終活の旅) :: This is the Japan Heritage (Japan Heritage) portal site entry concerning the 130 ()

## L3-30 [en] ローカル線 山村
**Query**: Mountain villages where the train comes once every two hours.
**Tool**: search_area({"q": "ローカル", "lang": "en"})
**Summary**: count=0, topic_hit=False


# L4 (20 cases)

## L4-01 [en] 伝統食 知られざる
**Query**: Tell me about Japan's traditional food culture that hasn't gone mainstream yet.
**Tool**: get_local_food({"lang": "en"})
**Summary**: count=507, topic_hit=False
**First 5 items:**
  - [maff_gi] Aomori Cassis (あおもりカシス) :: The variety is 'Aomori Cassis'. It has a refreshing acidity and a distinctive ar ()
  - [maff_gi] Tajima Beef (但馬牛) :: Carcass meat graded A or B, grade 2 or higher, produced by fattening Tajima catt ()
  - [maff_gi] Kobe Beef (神戸ビーフ) :: Carcass meat graded A or B grade 4 or higher and BMS No. 6 or higher, produced b ()
  - [maff_gi] Yubari Melon (夕張メロン) :: The flesh is orange in color, very soft and juicy due to its low fiber content.  ()
  - [maff_gi] Yame Traditional Gyokuro (八女伝統本玉露) :: By covering the tea leaves with natural materials such as rice straw before harv ()

## L4-02 [ja] L4-01の日本語版
**Query**: まだメジャーじゃない日本の伝統的な食文化を教えて。
**Tool**: get_local_food({"lang": "ja"})
**Summary**: count=507, topic_hit=False
**First 5 items:**
  - [maff_gi] あおもりカシス (あおもりカシス) :: 品種は「あおもりカシス」。さわやかな酸味や独特の芳香があり、アントシアニンも豊富。完熟したものから選別し、全て手摘みで収穫。 ()
  - [maff_gi] 但馬牛 (但馬牛) :: 兵庫県北部の但馬地方の山あいで長い歳月をかけ改良が重ねられた但馬牛を素牛として肥育し、A・B2等級以上に格付けされた枝肉であり、肉そのものが柔らかい。 ()
  - [maff_gi] 神戸ビーフ (神戸ビーフ) :: 兵庫県北部の但馬地方の山あいで長い歳月をかけ改良が重ねられた但馬牛を素牛として肥育し、A・B4等級以上でBMSNo6以上に格付けされた枝肉であり、最高級の霜ふり ()
  - [maff_gi] 夕張メロン (夕張メロン) :: 果実は、内部色はオレンジ色で、繊維質が少ないことから非常に柔らかく、ジューシー。 芳醇な香りが強い「夕張キング」という品種を使用しており、糖度は10度以上。 ()
  - [maff_gi] 八女伝統本玉露 (八女伝統本玉露) :: 茶葉収穫前に稲わら等の天然資材で被覆することにより「覆い香」といわれる香気成分の含有量が高い茶葉が生産される。味は濃厚で非常にうま味が強く、「まろやか」で「こく ()

## L4-03 [en] 失われゆく職人技
**Query**: Forgotten craftsman skills still alive in Japan.
**Tool**: get_traditional_arts({"lang": "en"})
**Summary**: count=183, topic_hit=False
**First 5 items:**
  - [?] Nogaku (能楽) :: A traditional performing art of Japan. A collective term for Noh, Kyogen, and re ()
  - [?] Kifune Festival (貴船まつり) :: The annual grand festival of Kifune Shrine in Manazuru Town, Kanagawa Prefecture ()
  - [?] Okumakabuto Festival (お熊甲祭) :: The annual festival of Kumakabuto Aragakashihiko Shrine, located in Nanao City,  ()
  - [?] Yobuko Otsunahiki (呼子大綱引き) :: A traditional event passed down in Yobuko-machi, Karatsu City, Saga Prefecture. ()
  - [?] Kawagoe Hikawa Festival (川越氷川祭) :: The festival of Kawagoe Hikawa Shrine in Kawagoe City, Saitama Prefecture. ()

## L4-04 [en] 浮世絵風景
**Query**: Japanese landscapes that look like a Hokusai woodblock print.
**Tool**: search_area({"q": "富士", "lang": "en"})
**Summary**: count=50, topic_hit=False
**First 5 items:**
  - [wikidata] 富士浅間神社 (富士浅間神社) ::  (23)
  - [wikidata] 富士浅間神社 (富士浅間神社) ::  (23)
  - [wikidata] 富士浅間神社 (富士浅間神社) ::  (23)
  - [wikidata] 扶桑教安房富士教会 (扶桑教安房富士教会) ::  (12)
  - [wikidata] 扶桑教富士仙元教会 (扶桑教富士仙元教会) ::  (12)

## L4-05 [en] UNESCO 知られざる
**Query**: Lesser-known UNESCO sites in Japan.
**Tool**: get_japan_heritage({"lang": "en"})
**Summary**: count=104, topic_hit=False
**First 5 items:**
  - [?] Early Modern Japan's Educational Heritage: The Roots of a Desire to Learn and of Etiquette (近世日本の教育遺産群) :: Regarding the early modern Japan educational heritage sites on the Japan Heritag ()
  - [?] Kakaa Tenka: The Silk Story of Gunma (かかあ天下) :: Regarding Kakaa Tenka on the Japan Heritage portal site. In the farmhouses of Jo ()
  - [?] Takaoka — A Town Where Civic Culture Rooted in the Kaga Maeda Clan Flourishes: People, Craft, and Spirit (加賀前田家ゆかりの町民文化が花咲くまち高岡) :: This is the Japan Heritage (Japan Heritage) portal site entry for Takaoka, a tow ()
  - [?] The Lantern-Dancing Peninsula: Noto — Festival of Kiriko Frenzy (灯（あか）り舞う半島　能登) :: About the Japan Heritage (Japan Heritage) portal site entry for 'The Lantern-Dan ()
  - [?] Wakasa's Cultural Heritage of Exchange Connecting the Sea and the Capital — Miketsukuni Wakasa and the Saba Kaido (海と都をつなぐ若狭の往来文化遺産群) :: Wakasa, facing the Sea of Japan and blessed with abundant nature, supplied seafo ()

## L4-06 [en] 縄文文化 現代
**Query**: Areas in Japan where the old Joumon-era culture still influences daily life.
**Tool**: search_area({"q": "縄文", "lang": "en"})
**Summary**: count=18, topic_hit=False
**First 5 items:**
  - [wikidata] 伊勢堂岱縄文館 (伊勢堂岱縄文館) ::  (05)
  - [wikidata] 八戸市埋蔵文化財センター 是川縄文館 (八戸市埋蔵文化財センター 是川縄文館) ::  (02)
  - [wikidata] 縄文時遊館 (縄文時遊館) ::  (02)
  - [wikidata] 縄文の学び舎・小牧野館 (縄文の学び舎・小牧野館) ::  (02)
  - [wikidata] つがる市縄文住居展示資料館 カルコ (つがる市縄文住居展示資料館 カルコ) ::  (02)

## L4-07 [zh] 発酵食 全国
**Query**: 日本各地有什么特色的发酵食品文化？
**Tool**: get_local_food({"lang": "zh"})
**Summary**: count=507, topic_hit=True
**First 5 items:**
  - [maff_gi] 青森黑加仑 (あおもりカシス) :: 品种为"青森黑加仑"。具有清爽的酸味和独特的芳香，富含花青素。从完全成熟的果实中精选，全部手工采摘收获。 ()
  - [maff_gi] 但马牛 (但馬牛) :: 以兵库县北部但马地方山谷中经过漫长岁月不断改良的但马牛为基础牛进行育肥，所得枝肉经格级评定达到A·B2等级以上，肉质本身柔软。 ()
  - [maff_gi] 神户牛肉 (神戸ビーフ) :: 以在兵库县北部但马地区山村中经过长年改良的但马牛为基础牛只进行育肥，经评级达到A·B4等级以上且BMS No.6以上的牛胴体，属最高级别的雪花牛肉。 ()
  - [maff_gi] 夕张甜瓜 (夕張メロン) :: 果肉呈橙色，因纤维质少而非常柔软多汁。使用芳香浓郁的"夕张King"品种，糖度在10度以上。 ()
  - [maff_gi] 八女传统本玉露 (八女伝統本玉露) :: 在茶叶采收前，用稻草等天然材料进行覆盖，由此生产出含有被称为"覆盖香"（覆い香）香气成分含量较高的茶叶。口感浓郁，鲜味极强，"柔和"而"醇厚"。 ()

## L4-08 [en] 山岳信仰 シャーマン
**Query**: Hidden mountain villages where shamanic traditions still exist.
**Tool**: get_traditional_arts({"lang": "en"})
**Summary**: count=183, topic_hit=False
**First 5 items:**
  - [?] Nogaku (能楽) :: A traditional performing art of Japan. A collective term for Noh, Kyogen, and re ()
  - [?] Kifune Festival (貴船まつり) :: The annual grand festival of Kifune Shrine in Manazuru Town, Kanagawa Prefecture ()
  - [?] Okumakabuto Festival (お熊甲祭) :: The annual festival of Kumakabuto Aragakashihiko Shrine, located in Nanao City,  ()
  - [?] Yobuko Otsunahiki (呼子大綱引き) :: A traditional event passed down in Yobuko-machi, Karatsu City, Saga Prefecture. ()
  - [?] Kawagoe Hikawa Festival (川越氷川祭) :: The festival of Kawagoe Hikawa Shrine in Kawagoe City, Saitama Prefecture. ()

## L4-09 [en] 戦争遺跡 日常
**Query**: Areas in Japan where nuclear bomb history is part of daily landscape.
**Tool**: search_area({"q": "原爆", "lang": "en"})
**Summary**: count=13, topic_hit=False
**First 5 items:**
  - [wikidata] 韓国人原爆犠牲者慰霊碑 (韓国人原爆犠牲者慰霊碑) ::  (34)
  - [wikidata] 国立広島原爆死没者追悼平和祈念館 (国立広島原爆死没者追悼平和祈念館) ::  (34)
  - [wikidata] 原爆供養塔 (原爆供養塔) ::  (34)
  - [wikidata] 原爆十景 (原爆十景) ::  (34)
  - [wikidata] 原爆死没者慰霊碑 (原爆死没者慰霊碑) ::  (34)

## L4-10 [en] 工芸の町
**Query**: Japanese towns built around a single craft industry.
**Tool**: get_local_specialty({"category": "craft", "lang": "en"})
**Summary**: count=231, topic_hit=True
**First 5 items:**
  - [?] Nibutani Attus (二風谷アットゥㇱ) :: Attus refers to a woven textile made using thread spun from the bark fibers of t ()
  - [?] Oitama Tsumugi (置賜紬) :: Oitama Tsumugi is the collective name for all textiles produced in this region.  ()
  - [?] Ugo Shina Cloth (羽越しな布) :: A woven fabric made from bast fibers derived from the bark of the Japanese linde ()
  - [?] Yuki Tsumugi (結城紬) :: Because the thread is drawn by hand from silk wadding (mawata), each of the one  ()
  - [?] Isesaki Kasuri (伊勢崎絣) :: Because the fabric is produced through numerous processes centered on handwork,  ()

## L4-11 [en] 産業遺産
**Query**: Where can I see Japan's response to industrial decline preserved?
**Tool**: search_area({"q": "産業遺産", "lang": "en"})
**Summary**: count=1, topic_hit=True
**First 5 items:**
  - [wikidata] 富岡製糸場と絹産業遺産群 (富岡製糸場と絹産業遺産群) ::  (10)

## L4-12 [ko] 宗教多様性
**Query**: 일본의 종교적 다양성을 가장 잘 보여주는 지역은?
**Tool**: get_japan_heritage({"lang": "ko"})
**Summary**: count=104, topic_hit=False
**First 5 items:**
  - [?] 근세 일본의 교육 유산군　배움의 마음・예절의 본원 (近世日本の教育遺産群) :: 일본유산（Japan Heritage）포털사이트의 근세 일본 교육 유산군에 관하여. 근세 일본을 방문한 외국인들은 기행문에 일본인의 모습을 기록하 ()
  - [?] 카카아 텐카 — 군마의 비단 이야기 (かかあ天下) :: 일본 유산（Japan Heritage）포털 사이트의 카카아 텐카에 관하여. 조슈의 농가에는 소중히 보관되어 온 비단 기모노가 잠들어 있다. （원 ()
  - [?] 가가 마에다 가문과 인연 깊은 조민 문화가 꽃피는 도시 다카오카　－사람, 기술, 마음－ (加賀前田家ゆかりの町民文化が花咲くまち高岡) :: 이것은 일본유산（Japan Heritage）포털 사이트의 「가가 마에다 가문과 인연 깊은 조민 문화가 꽃피는 도시 다카오카」에 관한 소개입니다. ()
  - [?] 등불 춤추는 반도　노토　～열광의 기리코 축제～ (灯（あか）り舞う半島　能登) :: 일본유산（Japan Heritage）포털 사이트의 「등불 춤추는 반도　노토」에 관한 소개. 일본 열도의 거의 중앙에 위치한 이시카와현. 일본해로 ()
  - [?] 바다와 도읍을 잇는 와카사의 왕래 문화유산군　～미케츠쿠니（御食国）와카사와 고등어 가도～ (海と都をつなぐ若狭の往来文化遺産群) :: 일본해에 면하며 풍부한 자연의 혜택을 받은 와카사는 고대부터 해산물과 소금을 도읍에 공급하였습니다. 이 일본유산 스토리는 와카사와 도읍을 잇는  ()

## L4-13 [en] 消えゆく祭り
**Query**: Lost or dying festivals that still happen in remote Japan.
**Tool**: get_festivals({"lang": "en"})
**Summary**: count=81, topic_hit=False
**First 5 items:**
  - [bunka_intangible] Kifune Festival (貴船まつり) :: The annual grand festival of Kifune Shrine in Manazuru Town, Kanagawa Prefecture ()
  - [bunka_intangible] Okumakabuto Festival (お熊甲祭) :: The annual festival of Kumakabuto Aragakashihiko Shrine, located in Nanao City,  ()
  - [bunka_intangible] Kawagoe Hikawa Festival (川越氷川祭) :: The festival of Kawagoe Hikawa Shrine in Kawagoe City, Saitama Prefecture. ()
  - [bunka_intangible] Tatemon Festival (たてもん祭り) :: A summer festival held at Suwa Shrine in Uozu City, Toyama Prefecture. ()
  - [bunka_intangible] Yasurai Festival (やすらい祭) ::  ()

## L4-14 [en] 震災復興 沿岸
**Query**: Japanese coastal areas shaped by the 2011 tsunami, ten years on.
**Tool**: search_area({"q": "震災", "lang": "en"})
**Summary**: count=16, topic_hit=True
**First 5 items:**
  - [wikidata] 関東大震災犠牲同胞慰霊碑 (関東大震災犠牲同胞慰霊碑) ::  (12)
  - [wikidata] 震災遺構 浪江町立請戸小学校 (震災遺構 浪江町立請戸小学校) ::  (07)
  - [wikidata] 東日本大震災・原子力災害伝承館 (東日本大震災・原子力災害伝承館) ::  (07)
  - [wikidata] 神戸港震災メモリアルパーク (神戸港震災メモリアルパーク) ::  (28)
  - [wikidata] 神戸震災復興記念公園 (神戸震災復興記念公園) ::  (28)

## L4-15 [en] 擬洋風建築
**Query**: Architecture that blends Western and Japanese styles from Meiji era.
**Tool**: search_area({"q": "擬洋風", "lang": "en"})
**Summary**: count=0, topic_hit=False

## L4-16 [en] 隠れキリシタン
**Query**: Japan's hidden Christian heritage.
**Tool**: get_japan_heritage({"prefecture": "Nagasaki", "lang": "en"})
**Summary**: count=8, topic_hit=False
**First 5 items:**
  - [?] Islands on the Border: Iki, Tsushima, and Goto — Bridges from Ancient Times (国境の島　壱岐・対馬・五島) :: Information on the border islands of Iki, Tsushima, and Goto on the Japan Herita ()
  - [?] "Kitaso Four Cities Edo Journey: Kitaso Townscapes That Evoke Edo" — Sakura, Narita, Sawara, Choshi: Four Representative Townscape Groups on the Outskirts of Edo That Supported the Million-Person City of Edo (「北総四都市江戸紀行・江戸を感じる北総の町並み」) :: From the Japan Heritage (Japan Heritage) portal site entry for 'Kitaso Four Citi ()
  - [?] Chinjufu: Yokosuka, Kure, Sasebo, Maizuru — Cities Where You Can Feel the Energy of Japan's Modernization (鎮守府　横須賀・呉・佐世保・舞鶴) :: About the Japan Heritage (Japan Heritage) portal site entry for Chinjufu — Yokos ()
  - [?] Headquarters of 'Japan's Greatest Pirates': The Geiyo Islands — Reviving the Memory of the Murakami KAIZOKU (“日本最大の海賊”の本拠地：芸予諸島) :: From the Japan Heritage (Japan Heritage) portal site, regarding 'Headquarters of ()
  - [?] Hizen, Birthplace of Japanese Porcelain: A Walk Among a Profusion of Ceramics (日本磁器のふるさと　肥前) :: Regarding Hizen, birthplace of Japanese porcelain, on the Japan Heritage portal  ()

## L4-17 [en] 庭園 知られざる
**Query**: Traditional Japanese gardens designed by lesser-known garden masters.
**Tool**: search_area({"q": "庭園", "lang": "en"})
**Summary**: count=50, topic_hit=True
**First 5 items:**
  - [wikidata] 二之丸庭園 (二之丸庭園) ::  (23)
  - [wikidata] 白鳥庭園 (白鳥庭園) ::  (23)
  - [wikidata] 久屋大通庭園フラリエ (久屋大通庭園フラリエ) ::  (23)
  - [wikidata] 藤田記念庭園 (藤田記念庭園) ::  (02)
  - [wikidata] 清藤氏書院庭園 (清藤氏書院庭園) ::  (02)

## L4-18 [en] 染色 伝統技法
**Query**: Where can I experience Japan's traditional textile dyeing techniques?
**Tool**: get_local_specialty({"category": "craft", "lang": "en"})
**Summary**: count=231, topic_hit=True
**First 5 items:**
  - [?] Nibutani Attus (二風谷アットゥㇱ) :: Attus refers to a woven textile made using thread spun from the bark fibers of t ()
  - [?] Oitama Tsumugi (置賜紬) :: Oitama Tsumugi is the collective name for all textiles produced in this region.  ()
  - [?] Ugo Shina Cloth (羽越しな布) :: A woven fabric made from bast fibers derived from the bark of the Japanese linde ()
  - [?] Yuki Tsumugi (結城紬) :: Because the thread is drawn by hand from silk wadding (mawata), each of the one  ()
  - [?] Isesaki Kasuri (伊勢崎絣) :: Because the fabric is produced through numerous processes centered on handwork,  ()

## L4-19 [en] 街道 宿場町
**Query**: Areas where you can still see remnants of Edo-period highway culture.
**Tool**: search_area({"q": "宿場", "lang": "en"})
**Summary**: count=0, topic_hit=False

## L4-20 [en] 巡礼 88以外
**Query**: Japan's spiritual pilgrimages beyond Shikoku 88.
**Tool**: get_japan_heritage({"lang": "en"})
**Summary**: count=104, topic_hit=True
**First 5 items:**
  - [?] Early Modern Japan's Educational Heritage: The Roots of a Desire to Learn and of Etiquette (近世日本の教育遺産群) :: Regarding the early modern Japan educational heritage sites on the Japan Heritag ()
  - [?] Kakaa Tenka: The Silk Story of Gunma (かかあ天下) :: Regarding Kakaa Tenka on the Japan Heritage portal site. In the farmhouses of Jo ()
  - [?] Takaoka — A Town Where Civic Culture Rooted in the Kaga Maeda Clan Flourishes: People, Craft, and Spirit (加賀前田家ゆかりの町民文化が花咲くまち高岡) :: This is the Japan Heritage (Japan Heritage) portal site entry for Takaoka, a tow ()
  - [?] The Lantern-Dancing Peninsula: Noto — Festival of Kiriko Frenzy (灯（あか）り舞う半島　能登) :: About the Japan Heritage (Japan Heritage) portal site entry for 'The Lantern-Dan ()
  - [?] Wakasa's Cultural Heritage of Exchange Connecting the Sea and the Capital — Miketsukuni Wakasa and the Saba Kaido (海と都をつなぐ若狭の往来文化遺産群) :: Wakasa, facing the Sea of Japan and blessed with abundant nature, supplied seafo ()
