# Wardrobe 1974: reference study for the pedestrian generator

Workstream: characters. This file feeds `src/characters/wardrobe/` and the archetype `palette` /
`wardrobe` / `props` fields. It **extends** `docs/STYLE_GUIDE.md` §7 "People and wardrobe" and
does not replace it. Every statement is either tied to a photo id or marked
**(period knowledge, not from refs)**.

An id like `[551651]` is `references/img/documerica_551651.jpg`. All photos are public-domain
EPA DOCUMERICA images (US National Archives via Wikimedia Commons). Credits are in
`references/catalog.json`.

---

## 1. Sources and method

**Method.** I first made contact sheets of all 115 catalogue images so none were skipped. Then I
viewed every image that showed a person at full resolution, whatever its topic tags. For small
figures I cropped and enlarged the relevant area (for example the plaza group in `[551651]`, the
Bryant Park standing crowd in `[551771]` and the fountain sitters in `[551772]`, the Fifth
Avenue curb in `[554314]` and the 42nd Street sidewalk in `[554297]`). Colours were sampled as
the median of a small pixel box, then corrected by eye for the film's fade (see §3.12). Nothing
here is guessed from titles.

**Dates.** 25 of the ids I used have an empty `date` in the catalogue. Their dates below come
from the neighbouring NAIDs in the same roll and are marked "~". For example `[556824]` sits
beside `[556820]` (July 1974), and `[551642]`–`[551666]` sit beside `[551641]` (June 1973).

**What the references hold.**

| Group | Ids | Count |
|---|---|---|
| Legible people (garments readable) | 548257, 548268, 548373, 548388, 548397, 548399, 548402, 548410, 549323, 549812, 549850, 549851, 549855, 549859, 549863, 549866, 549867, 549869, 549873, 549876, 549882, 549916, 549921, 551641, 551642, 551643, 551644, 551646, 551651, 551658, 551664, 551666, 551667, 551668, 551669, 551685, 551686, 551687, 551688, 551689, 551692, 551693, 551695, 551696, 551697, 551699, 551705, 551770, 551771, 551772, 551773, 551774, 551779, 553822, 554293, 554299, 554308, 554312, 554314, 554354, 555907, 556677, 556685, 556706, 556824 | **65 photos** |
| Density or silhouette only (figures too small, blurred or distant for garments) | 549849, 549868, 549872, 549874, 549899, 553893, 554294, 554297, 556684, 556820, 551645, 551647, 551660, 551661, 551663, 549302, 549317, 549784, 548331 | 19 photos |
| No people, or only painted or printed faces | the skyline, grime and facade shots, plus `[556664]`, `[554298]`, `[554307]` (advertising posters and billboards of real or modelled people, **excluded on purpose**) | ~31 photos |

- **People counted:** about **230 individually legible people** (garments and hair readable),
  plus roughly **900–1,000 more** usable only for density and spacing. Most of those are in
  `[556684]` (~250 in a concourse), `[549849]`, `[554297]`, `[548388]` and `[548399]`.
- **Season split (this matters most).** The style guide says the refs are mostly cool-season.
  That holds for April–May 1973 street traffic, but **about 30 of the 65 legible photos are warm
  weather**:
  - June 1973: the plazas on Sixth Avenue (Rockefeller Center side), the East 35th Street block
    party, the playground at 22nd Street and Tenth Avenue, the antique booths.
  - August 1973: Fifth and Sixth Avenues, 42nd Street, 7th Avenue South.
  - June and July 1974: `[555907]`, `~[556824]`.

  So summer clothing in this file is **largely from refs**, and §4 only fills the gaps.
- **Location caveat.** Only part of the set is inside the Tenderloin box (23rd–42nd St):
  - Inside: Herald Square, the 34th Street department-store front, the garment district,
    Penn Station, 42nd Street, Bryant Park, 6th Avenue at 32nd, Broadway at 35th.
  - Just outside: East 35th Street (Murray Hill), 22nd and Tenth Avenue (Chelsea), and the
    Sixth Avenue plazas at 47th–52nd.
  - Further out: Lower Manhattan `[549916, 549921, 549323]`, the Upper East Side `[551779]` and
    the Village `[554354]`.

  The far-out shots are used for **garments only**, never for neighbourhood mix.

---

## 2. Per-photo observations

Abbreviations: FG = foreground, BG = background, M/W = man/woman, ~ = inferred date. Hexes in
this table are **corrected targets** (see §3.12), not raw pixels.

| id | date | what's visible | notes |
|---|---|---|---|
| 548257 | May 1973 | Herald Sq subway mezzanine. Older W: cream knit beret, dark navy knee-length coat, black patent handbag plus a clear printed shopping bag, low black shoes, on a pay phone. BG: W in red coat `#9a2a24` with shoulder bag; M in camel overcoat; M in vertical-stripe shirt and dark flared trousers, mid-stride. ~6 people. | Cool. Sparse indoor spacing. |
| 548268 | May 1973 | Indoor queue at a Herald Sq store for "free gifts". ~12 people packed shoulder to shoulder. Mostly women aged 55–75: set, curled or teased hair (white, grey, ash blonde); upswept cat-eye frames in white or clear plastic; woven cream-and-green tweed/bouclé check jacket `#c4b48f`. Bald M in grey herringbone sport coat; older M in dark flat cap with glasses; young M (20s) with full hair, moustache, large metal rectangular glasses and a mauve chevron knit jacket `#b49aa6`. | Best close-up of older-shopper hair and eyewear. Pressed, clean clothes. |
| 548373 | ~May 1973 | Fifth Ave by a church, street steam. One M from behind: full dark hair, light grey-beige belted zip jacket or raincoat `#bdb8a8`, dark grey trousers, hand raised to face. | Unclear whether he is smoking or not. |
| 548388 | May 1973 | Fifth Ave sidewalk, 50+ people flowing densely. FG M (30s): moustache and heavy stubble or short beard, dark suit, dark tie, white shirt. W: large tinted sunglasses, dark jacket, white trousers, shoulder bag. M: hair over the ears, dark suit, wide patterned tie. Bald older M in dark suit stepping off the curb. | Dark suits dominate. Bicycles chained to poles. |
| 548397 | ~May 1973 | Sixth Ave at 47th, jewellery window. Young M: thick dark hair to the collar, covering the ears, salmon long-sleeve shirt `#c86a50` with cuffs loose, hands on hips. Young W: long brown hair, black jacket. | Window-shopping pose. |
| 548399 | May 1973 | **Broadway at W 35th, sunny, 40+ people, crowd spilling into the crosswalk.** M (30s): moustache, full hair, long-sleeve paisley/floral wide-collar shirt (blue on white), wide belt, dark flared trousers, rolled paper in hand. M: tan/camel sport coat with lapels ~10–11 cm, maroon tie ~11 cm `#6e2228`, white shirt, tan trousers with a slight flare, brown shoes, carrying a paper bag. Balding M (50s): navy suit and white pocket square. W (20s): centre-parted shoulder-length hair, white blouse with big pointed collar, rust/maroon jacket and matching wide trousers `#7a2e28`. Behind: beige trench coats, a short-sleeve navy shirt. | **Key in-district ref.** Mixed jackets and shirtsleeves (late spring). |
| 548402 | May 1973 | Times Sq (Broadway at 46th). W (50s): blonde set bob, large-frame glasses, oatmeal tweed jacket `#b8a48a` over a cream top. Bald M (60s): tan suit jacket open, white shirt, wide patterned tie, carrying papers. Two figures in a doorway. | Sparse, sunny. |
| 548410 | May 1973 | Midtown crossing, small. Balding M in a green/brown check jacket; M in a cream jacket; M (30s) with glasses, a dark-red knit cap(?) and a tan coat with a fleece collar. | Detail uncertain. |
| 549323 | May 1973 | Chambers St outdoor clothing rack (Lower Manhattan). Older couple (65–75). M: balding, grey at the sides, dark rectangular glasses, navy windowpane-check sport coat `#2f3550` over a blue patterned shirt, holding up trousers. W: cream/straw brimmed hat `#d9c9a4`, camel jacket `#b98a5c`, white chiffon neck scarf. Vendor (W, 20s): waist-length wavy auburn hair, bold multicolour patchwork-print long-sleeve top (red, yellow, blue). | Outside the district; garments only. |
| 549812 | ~spring 1973 | E 58th at Fifth. Older M (60s): dark grey felt hat with a mid brim, grey-brown suit with wide lapels, white pocket square, white shirt, grey tie, cuffed trousers, black shoes, oxblood hard-shell briefcase `#6e2a1e`, flicking ash or rubbish into a bin. Young M (20s): shaggy curly shoulder-length hair, satin-look pale beige shirt open at the neck `#c9bfae`, wide dark belt, cream high-waisted flared trousers, tan shoes, rolled paper. BG: M in pink shirt with dark trousers. | Generation-gap pairing in one frame. Strong sun. |
| 549850 | Apr 1973 | Garment district side street. Worker with dark skin and short hair, mustard/olive short-sleeve T-shirt `#a88a3a`, pushing an upright two-wheel hand truck with a big rope-tied fabric bundle **in the roadway** between trucks. | Matches the style guide's handcart worker. |
| 549851 | Apr 1973 | Midtown. M pulling a low flat dolly by rope in the road: dark quilted or leather jacket, jeans, sneakers. Driver: grey hair, glasses, grey suit, **smoking** at the wheel. Curb group (~10): young men in dark jackets, M in red plaid shirt, W in light-blue coat and knit hat, older M in beige raincoat and tie, M in flat cap. | Cool. |
| 549855 | ~Apr 1973 | **Seventh Ave curb queue, 8 people side-on, 30–60 cm apart.** M (50s): brown narrow-brim felt hat, glasses, brown/white houndstooth overcoat below the knee `#8a7a6a`, tan cuffed trousers `#b49a78`, brown shoes, folded newspaper under the arm. Older W: short dark set hair, dark belted coat to the knee, red shopping bag and dark handbag, pumps. Young W: ponytail, cream belted double-breasted trench above the knee `#d8cfb8`, cream turtleneck. Young W: large rounded afro, long black coat to the calf, jeans, portfolio, rolled umbrella. Young W: blunt blonde bob with bangs, brown suede knee coat open, cream mini mid-thigh, bare legs, yellow paper shopping bag. Two young W: long straight black hair, one in a red/blue tartan shirt-jacket, dark coats, long wooden-handled umbrella. | **Best single cool-season women's ref.** Overcast. |
| 549859 | ~Apr 1973 | Garment district curb, ~15 bunched between trucks. Older W: mustard knit beanie `#b08a2a`, glasses, black leather coat with fur collar. Young M: shoulder-length hair, glasses, dark brown corduroy or leather jacket, papers and pencil. Young person with a full afro in a beige jacket. Young M: shaggy hair, wire glasses, navy jacket. M (50s): dark coat, glasses. W: fur-trimmed hood, teased hair. W in red coat. | Cold-ish. |
| 549863 | Apr 1973 | **Jaywalking through stopped traffic (W 42nd area).** Young W: long straight dark centre-parted hair, shaggy cream long-pile fur(-look) jacket to the hip `#e3d8c6`, black ribbed knit top, black high-waisted wide flares covering the shoes (hem ≈ 30 cm flat). Behind: W in dark midi coat and dark knit cap; W in red knit beret; M in light trench; M in dark peacoat; W with shopping bag. | Arms tucked against the cold. |
| 549866 | Apr 1973 | Garment district (fisheye). M (30s): collar-length dark hair, dark suit open, white shirt open-necked. W: long dark hair, brown leather blazer, white top, brown wide trousers, platforms. M in dark suit from behind; M in light shirt by a truck. | People squeeze through the gaps between trucks. |
| 549867 | Apr 1973 | **Garment-district worker in the traffic lane** pulling a tall chrome-pipe cart with rope netting, loaded with fabric bolts and rolls. Medium-dark skin, short-to-medium dark hair; pale blue long-sleeve work shirt `#8b9cb0`; wide belt; grey flared work trousers `#5e5a58`; dark shoes. | Purposeful, leaning stride. Echoes style guide [549867]. |
| 549869 | Apr 1973 | Cab driver: grey hair, glasses, light short-sleeve shirt, **elbow out of the window**. | Pose ref for drivers. |
| 549873 | ~Apr 1973 | Midtown cab pickup. M (50s): balding, glasses, dark grey suit with wide lapels, tie, white shirt, getting in. Cluster of 6–8 men in dark suits and coats, one in a fedora. Left: M pushing a wheeled basket/hand cart; M in beige coat with a hand cart and boxes; W (20s) with big hair. | Garment carts in the street. |
| 549876 | Apr 1973 | Midtown corner, ~20 people. Young W with long fair hair getting out of a cab in a rust patterned top. W (40s): short curly hair, beige trench. Young W: long dark hair, olive parka jacket, carrying rolled paper tubes. Dark-skinned M (30s): yellow-olive turtleneck under a dark coat. Older men in dark fedoras and overcoats. Balding M (40s) in camel sport coat. Grey-haired M in bright red crew sweater `#b8322e` over a shirt. M in dark windbreaker. | Men mostly 40–65 on this corner. |
| 549882 | Apr 1973 | Garment district, Broadway at 8th, ~15 people spread across the intersection after rain. W: dark mid-calf midi coat, stepping over a puddle with a bag. M: dark brown suit, mid-stride. Worker pushing an empty tall chrome garment rack in the road. M (40s): light short-sleeve shirt, grey flat/driver cap, dark trousers at a truck. M: dark suit and briefcase, long stride. | Puddles; trousers worn long. |
| 549916 | May 1973 | West Broadway (Lower Manhattan). Young W: straight brown hair to mid-back, royal-blue fitted long-sleeve knit top `#2f4f86`, white high-waisted trousers `#e8e2d8`, dark jacket over the arm, bag. BG M: dark jacket, light shirt, dark trousers. | Overcast, mild. |
| 549921 | May 1973 | **Bus stop, warm sun, ~12 boarding in a tight bunch** (Lower Manhattan). Women 20s–50s: floral A-line skirt above the knee (red/blue/green on cream); olive short dress-and-jacket set above the knee `#5e5a2a` with reddish teased set hair; black dress with tan leather shoulder bag `#7a3a20`; madras-check short-sleeve blouse. **Ankle-strap platform sandals** (black, white) and black patent mid-heel pumps; bare legs or sheer hose. Men: young M with collar-length hair, long sideburns, blue/white stripe long-sleeve shirt, dark flares; M in navy/white horizontal-stripe knit polo; M in white shirt. White shopping bags, newspapers. | **Best warm-weather women's footwear ref.** |
| 551641 | Jun 1973 | Plaza fountain on Sixth Ave (Rockefeller Center side). Four girls (~10–12) in a youth-group uniform, described generically: olive-green short-sleeve dress `#4f5a3a`, yellow neck bow, number patches, dark knee socks. Bangs, barrettes, ponytails. One in a red zip jacket. Eating packed lunches on the ledge: paper bags, cans, crisps in a plastic bag, a folder. | Children only in daytime family or group contexts. |
| 551642 | ~Jun 1973 | Same plaza. Older M (60s) alone on a low wall **reading a broadsheet**, legs crossed: grey-brown felt hat with a narrow brim and small feather, grey tweed jacket `#5c5650`, dark trousers, black shoes. | Classic "bench reader". |
| 551643 | ~Jun 1973 | Plaza bench. Three men (45–65) in dark suits (one brown `#4a3328`, one navy), white shirts, narrow-to-mid dark ties; one in a light grey straw or felt hat with a dark band, hair slicked. They sit and talk. W (40s), back view: bright red/orange print blouse `#c0402c`, red skirt, dark bouffant, white shoes, handbag. BG: 30+ walkers on the Sixth Ave sidewalk, women in pale dresses. | **Suits worn in June heat by older office men.** |
| 551644 | ~Jun 1973 | Same plaza. Young W: strawberry-blonde hair in a high topknot, black long-sleeve top, short skirt mid-thigh, shoulder bag. Young M: shoulder-length hair, fine blue/white stripe long-sleeve shirt, dark trousers. Seated lunchers: men in white short-sleeve shirts. | ~15 people. |
| 551646 | ~Jun 1973 | Sixth Ave at Radio City. **Three young men (20s) eating lunch on a granite ledge**: (1) moustache, collar-length hair, light chambray work shirt `#9db0c8`, black trousers, brown paper-bag lunch; (2) shoulder-length straight black hair, navy work shirt, jeans, tan work boots; (3) curly hair, moustache, navy shirt, jeans, tan suede work boots `#8a6a48`. Passer-by: shaggy dark hair, slim black suit, white cuffs showing. Older M: grey hair, dark suit. | Lunch-break workers. Hundreds of bicycles in BG. |
| 551651 | ~Jun 1973 | **Sunken plaza, office lunch, ~12 FG plus ~15 on the terrace.** Young W with dark skin and short natural hair: pale-yellow short-sleeve top, navy skirt above the knee, black ankle-strap platform sandals. W (fair, older?): short set blonde hair, rust belted shirt-dress to the knee `#b0714a`, sandals, brown purse on lap. Young W: waist-length dark braid, mustard sleeveless mock-neck shell `#c99a35`, black trousers. W: short hair, tinted aviators, white short-sleeve pointed-collar blouse, **very wide pale-blue bell-bottoms** `#b9c3d0` (hem ≥ 30 cm flat), dark platform loafers. Person with collar-length shag: blue/white large-plaid long-sleeve shirt-jacket `#5d6f9a`, navy flares. W: **red pantsuit** (blazer and wide trousers `#a8302e`), dark shag, black handbag, head bowed over reading. Walking W (20s): long straight centre-part hair, navy scoop top with a cardigan in multicolour stripes (navy/cream/red), high-waisted wide beige trousers `#b2a080` dragging over the shoes, **red handbag on a long strap carried in hand**. | **Single best summer-office-women ref.** Wet paving patches. |
| 551658 | ~Jun 1973 | Fountain ledge, four seniors (65–80). M: thin slicked grey hair, brown suit `#5a3d2a`, dark tie, white shirt, hands clasped. W: white curly set hair, cat-eye glasses, grey-blue floral shirtwaist dress to the knee, **white low lace-up shoes**, beige handbag. W: white set hair, white sleeveless dress with black daisy print, brown low pumps, white handbag. W: white hair, glasses, blue/white large-floral sleeveless dress `#6f8fb8`, white slip-ons, gesturing. | Knees together, handbags on laps. **Older-women summer template.** |
| 551664 | ~Jun 1973 | Fountain maintenance worker in a **full-length hooded yellow rain slicker** `#c8962a`, standing in the basin. BG: M in tan suit with glasses and wide tie; seated young women with long hair, one in a striped top. | Generic municipal or contract worker. |
| 551666 | ~Jun 1973 | Print seller on Sixth Ave. Vendor (W, 20s): long straight blonde hair with a wide knotted headband scarf, sleeveless blue scoop tank `#5d7890`, dark short shorts or mini (mid-thigh), flat brown leather sandals, **arms folded, leaning on the wall**. Young men on the ledge: moustache with short curly hair and white long-sleeve shirt; shaggy hair and dark jacket; maroon beret `#7a2a38` with navy jacket; navy work shirt; tan suede boots. Older M: grey hair, glasses, suit and tie, standing. W: pale knit cap. W: long hair, brown leather shoulder bag. | ~15 people, bunched on the ledge. |
| 551667 | Jun 1973 | Playground at 22nd St and 10th Ave (Chelsea). W (20s): long dark hair, sleeveless white dress with red pinstripes, holding a toddler (white tee, green shorts). W (30s): dark floral blouse, seated, chrome folding umbrella stroller with canopy. Boys 8–12: red/white striped tee, navy shorts, **knee tube socks with yellow/red bands**, black canvas high-tops; boy in white tee and dark trousers. | Sprinklers on. Summer heat. |
| 551668 | Jun 1973 | Same place. W (20s): hair pulled back, short-sleeve large floral blouse (dark ground, red/pink/green), pushing an umbrella stroller with a fringed canopy; toddler in blue gingham. W (20s): long wavy auburn hair, white short-sleeve dress with pink vertical stripes to the knee, wristwatch, chrome stroller. Boy in red tee and flared jeans. | Hardly any adult men. |
| 551669 | Jun 1973 | Same place. Boys ~10–13: red short-sleeve tee `#a83530`, flared jeans `#4a5a7a` with wide hems, glasses, bowl cut; red/white hooped tee, navy shorts, striped tube socks, black high-tops; navy tank top, navy shorts, white socks, black high-tops. | Kids' summer template. |
| 551685 | Jun 1973 | **East 35th block party, high angle, ~50 people in loose groups 1–3 m apart.** Older W in yellow belted rain jacket `#c9a030`; older W in black/white houndstooth jacket; young W in white top and very short white shorts; men in white shirts with dark trousers or jeans; balloons; folding tables. | Murray Hill, just east. |
| 551686 | Jun 1973 | Same, wider. W (50s): dark hair, glasses, blue/green neck scarf, dark top, green/white plaid A-line skirt below the knee, handbag. W in red sweater `#b33a30`. M on a 10-speed bicycle in a white shirt. ~60 people. | |
| 551687 | Jun 1973 | Same, sidewalk. W (50s): set dark hair, navy cardigan over a black dress with large red/orange polka dots `#c0402a`, **pulling a black wire two-wheel folding shopping cart** of paper bags. Young W: long wavy strawberry-blonde hair, red/white gingham long-sleeve top, **red wide flares** `#a8302a`, white platforms, plastic bag. W: curly auburn hair, navy jacket, red wide trousers, black handbag. Young W: grey tee, dark trousers. W on a folding stepladder: long blonde hair, dark tee, jeans. | Red trousers × 2 in one frame. |
| 551688 | Jun 1973 | Same, sunny. W (40s): dark bob, black-and-white pin-dot long-sleeve dress. W (back): multicolour zigzag knit short-sleeve top with white skirt. W (40s): blonde set hair, tinted glasses, sleeveless white shell, long bead necklace. Girl (~5) in red turtleneck. M (40s): balding, slicked dark hair, red short-sleeve knit polo with wide collar `#a83530`, dark brown trousers. M in a straw wide-brim hat; M in check shirt and flared jeans; M with camera, jeans and white sneakers. | ~40 in the street. |
| 551689 | Jun 1973 | Vertical companion to 551688: the same red polo, pin-dot dress with shag cut, child in white turtleneck, W in sleeveless cream top with beads, M in plaid shirt, M in white short-sleeve shirt. | |
| 551692 | ~Jun 1973 | Church-front café table (E 35th). M (50s): curly grey-brown hair, tinted glasses, moustache, white short-sleeve shirt with epaulettes, **canvas flap messenger bag** `#a89a80`. Young W: ginger shag with bangs, oversize glasses, cream ribbed long-sleeve knit `#d4c4b0`. Balding M (40s): **large white-framed sunglasses**, navy snap-front jacket `#2e3550`, blue/white print shirt with long collar points, big belt buckle, counting money. Older W: teal coat. Women on steps: red/pink floral knee-length shirt-dress; brown/orange print dress. | Hot sun. |
| 551693 | ~Jun 1973 | E 35th sidewalk under an apartment canopy. Boy (~5): navy/white striped tee, dark jeans, dark canvas high-tops, eating. M (30s): white short-sleeve shirt, dark trousers, at a table. Seniors sitting in shade on a planter ledge. | |
| 551695 | Jun 1973 | Antique booth at a brownstone stoop. Vendor W (30s–40s): **wide-brim natural straw hat with white silk flowers**, dark sunglasses, cream short-sleeve fitted knit, white pleated midi skirt below the knee. Customers: older W with short white hair, glasses, brown/red plaid shirt-dress `#6a3a30`, handbag on the wrist; W (40s) with copper-red set curls `#a0502a`, light-blue long-collar shirt, long blue skirt; W with dark short hair and glasses. | Overcast. |
| 551696 | Jun 1973 | Antique table, high angle. Older M (60s): dark suit, white shirt, dark tie, **hands behind back**. W (30s): white long-sleeve shirt, white trousers, belt. W: short hair, glasses, **sleeveless navy/white vertical-stripe button shirt-dress to the knee**. Young M: curly collar-length hair, navy/red/cream broad-stripe knit polo, khaki trousers. M (30s): white short-sleeve knit polo, khaki chinos `#b0a080`, dark belt, eating, plastic bag. W: long brown hair, glasses, beige midi, red bag, black low heels. Older W: curly grey hair, dark cardigan. Passer-by in white flares and tan shoes. | Clean warm-weather mix. |
| 551697 | ~Jun 1973 | Parking-lot flower sale (E 30th), ~45 people. Young W: long brown hair, **cream crochet fringed shawl** `#ddd2bc`, dark flared jeans. Crouching young W: copper hair, shiny navy vinyl-look hip coat, brown platform shoes. Young W: long dark belted navy midi coat, flares, platforms. Young M: long hair, glasses, red plaid flannel shirt, navy jacket. W in **white kerchief headscarf**, crouching. Two people in hooded olive parkas `#7a7050`. Older women in beige trench and red coat; W in long yellow dress; W in red pantsuit; men in dark suits. | Cool spring morning (light coats). |
| 551699 | ~Jun 1973 | Same lot, wider, ~40 browsing 1–3 m apart. W: **floor-length yellow skirt** `#d1a63a`, wide yellow sun hat, white blouse. Young W: burgundy trench/pantsuit `#8a2a2a`, bag. W: long navy coat, book. W: navy top, red flares. M: tan suede jacket `#a08a68`, dark trousers. Men in white shirts with grey slacks; M in light tan suit; W in long camel coat. | |
| 551705 | Jun 1973 | Office plaza (W 52nd). W (30s): flipped shoulder-length brown shag, oatmeal ribbed short-sleeve sweater `#c8a888` worn over a white pointed-collar blouse with the collar out, gardening. BG: W in white flared trousers and rust top, **yellow woven straw tote** `#d9ac4a`, mid-stride. W: short hair, white sleeveless top, white shorts or short skirt. M (40s): light-blue short-sleeve shirt, shoulder bag. M in tan shirt and tan trousers. Café diners. | ~15 people. |
| 551770 | Oct 1973 | **Bryant Park lunchtime concert (in district).** Harpist (W): cream blouse. Young M guitarist: collar-length hair, **denim jacket and flared jeans**, brown boots. Bassist in dark clothes. ~40 in the audience, standing in a ring 5–10 m away or sitting on steps; W in red jacket kneeling. | Autumn. |
| 551771 | Oct 1973 | Bryant Park standing audience, mostly men spaced 1–2 m apart, **hands in pockets, arms folded, hands behind backs**. Young men: white shirts, wide patterned ties (one diamond pattern), dark trousers. M (50s): **white flat cap** `#d8d0c0`, tan zip windbreaker `#b89a6a`, hands in pockets. M: dark suit, arms folded, **briefcase at his feet**. M: camel sport coat over open white shirt. W: curly reddish hair, grey-blue tunic, dark trousers. M in red/pink shirt sitting on a step. FG M reclining on a bench reading, white sneakers. | Dappled light. |
| 551772 | Oct 1973 | Bryant Park fountain. **~20 men on the rim reading newspapers** (tabloids and broadsheets), most 40–75, **hunched forward with elbows on knees**. Older M: white hair, pale pink/beige short jacket, light trousers, jacket over arm. Others: grey suits, brown leather jacket, navy windbreaker, white shirt. Young M: shaggy hair, navy jacket, jeans. Few women (one in red). | Strong "idle men in the park" ref (in district). |
| 551773 | Oct 1973 | Flower-show tent (Bryant Park), heavy yellow cast. Older women 60–80: white curly hair with **matching plaid jacket and skirt** below the knee and a rosette; white set hair with cream sweater; camel coat with shoulder bag. Men in camel and dark suits. | Colours unreliable (tent cast). |
| 551774 | Oct 1973 | Same tent. Older W (60s): ash-blonde set hair, glasses, **flecked oatmeal tweed swing coat with wide collar** `#b49a7a` (de-cast guess) past the knee. W in dark patterned dress. M in white shirt; M in dark suit. ~20 in a crowded aisle. | Cast. |
| 551779 | Apr 1973 | Third Ave florist (UES). Young M (~17–20): short dark hair, light blue-grey zip jacket/smock `#a8b4c8`, dark trousers, arranging flowers. | Shop-worker pose. Outside the district. |
| 553822 | Aug 1973 | **In front of the 34th St department store (in district).** Dense, motion-blurred crowd, shoulder to shoulder, ~20 visible. FG: mustard knit tam/beret `#c8a050`, red/rust woven check shirt-jacket `#9a3a36`. Older W: grey/cream tweed knee coat `#8a8478`, pale scarf, dark handbag. W (30s): large tinted sunglasses, white jacket with dark lapels. Young W: long hair, navy coat, white collar. Red-haired W. | Coats on an "August" frame and a cooler film stock: **date/season doubtful**. Style guide cites it for knit caps (consistent). |
| 554293 | Aug 1973 | Sixth Ave at 32nd (in district). **Motor-scooter traffic officer, generic**: white helmet, light-blue short-sleeve uniform shirt, dark trousers, black boots, feet down. | No legible pedestrians. |
| 554297 | Aug 1973 | **42nd St west of 7th, under the grindhouse marquees.** ~25 small figures, standing and loitering in clumps; light short-sleeve shirts (white, cream, pale blue, pink), one saturated yellow top, dark trousers; mostly men. | Density and colour only. |
| 554299 | Aug 1973 | 47th St, after rain. M (30s): dark hair, glasses, **cream sport coat** `#d8cfc0`, dark trousers. Older M: **white short-brim summer hat** `#e0dcd0`, dark suit, white shirt, tie. Partial figure: tan jacket, cigarette in hand. | Summer hat on an older man. |
| 554308 | ~Aug 1973 | Sixth Ave at 47th. **City signal worker, generic**: white hard hat, dark short-sleeve knit shirt with fine stripes `#2a2a40`, dark trousers, white/grey sneakers, wrestling a toppled signal pole. BG: women in sleeveless print dresses with white shopping bags. | |
| 554312 | Aug 1973 | Sixth Ave at 50th plaza, ~40 people. Older M: dark suit, red tie, walking. M: pink short-sleeve shirt. W: light-blue short-sleeve dress. Men in white short-sleeve shirts. Seated W: sleeveless green floral dress. Young M: white flares and striped tee. W: print blouse. W: pink dress. | Summer. |
| 554314 | ~Aug 1973 | **Fifth Ave at 48th curb, ~40 waiting.** FG M: navy blazer, newspaper. Older W (60s): grey set hair, **pale pink/lilac pantsuit** `#d6a0b8` with straight-flare trousers, white shoulder bag. M in grey suit. Young M: white short-sleeve shirt, dark trousers, hand on hip, brown shoes. Young W: **pink sleeveless top with pink wide flares**, white handbag, **white platform sandals**. W: red top, white skirt. W: floral dress. M: khaki short-sleeve shirt and khaki trousers. | **Short sleeves dominate among men.** |
| 554354 | ~Aug 1973 | 7th Ave South at 8th St (Village). Scooter patrol officer, generic: pale-blue helmet, light-blue short-sleeve shirt, dark trousers, duty belt. Crossing: W (30s) in light floral knee dress and flat sandals with a bag; M (30s) in grey waistcoat over a shirt, dark flares; boy (~8) in white tank top and jeans. Gas-station attendant in grey work clothes. | Hazy heat. |
| 555907 | Jun 1974 | Hell's Kitchen curb. M (20s–30s): dark hair, dark tee, grey/navy work trousers, brown suede work boots, **lying on a woven mat under a car on a red floor jack, milk crate beside him**. | **Only dated-1974 summer street-worker ref.** |
| 556677 | Apr 1974 | Penn Station boarding gate, dense and blurred. M (30s): scarlet blazer `#a8342c` (staff? uncertain). Peaked-cap uniformed rail employee, generic dark jacket. W: cream belted trench `#d8cfb8`, light flares, red/white stripe carryall. Person in white knit or fur-look hat with dark coat and rust shoulder bag. Men 25–40: tan suede coats and sport coats with wide lapels, shag hair, briefcases, suitcases. | |
| 556684 | ~Apr 1974 | Penn Station concourse from above: ~250 people, a dense knot round the information booth, loose elsewhere, almost all dark coats (navy, brown, black) with the odd camel; mostly bare heads. | Density only. |
| 556685 | Apr 1974 | **Penn Station ticket queue, ~40 people 0.5–1 m apart, hard suitcases at their feet.** Young M: **brown/cream large-tartan matching jacket and flared trousers** `#7a5a3a`/`#c9b490`, dark platforms, collar-length hair. Young W: **patchwork fur jacket** (cream/brown/tan blocks), dark floppy brimmed hat, dark flares. W: cream belted trench above the knee, **black platform slingbacks**, dark shoulder-length hair. Older M: grey hair, long tan overcoat below the knee. W: camel coat. W: beige suit with short light bob. | Fluorescent cast. Strongest "loud 1974 youth" ref. |
| 556706 | ~Apr 1974 | Rail ticket agent, generic uniform: dark-skinned W (30s), short natural hair, large clear frames, red stud earrings, **red vest over navy blouse with a red/white/blue patterned neck scarf**, name badge. Customer FG: black set curls, dark polka-dot coat; dark fur collar or hat beside. | Generic: no insignia to copy. |
| 556824 | ~Jul 1974 | Lexington Ave subway turnstile. Young W (18–22): dark straight bob with centre part, **puff-sleeve floral knit top** (pink/white), thin-strap shoulder bag, dropping a token. Older M (55–65): short grey-black hair, white short-sleeve shirt, wide belt with metal buckle, folded tabloid. | **Summer 1974** (inferred). Strong magenta cast. |

---

## 3. Synthesis by category

### 3.1 Men's daywear
- **Office and business, cool season:** dark suits (navy, charcoal, brown) are the default for
  men over 35 `[548388, 549873, 549876, 549882, 556684]`.
  - Lapels are wide, about 9–11 cm `[548399, 549812, 549873]`.
  - Ties are wide (10–12 cm) and often patterned or maroon `[548399, 548402, 551771]`.
  - White shirts are the norm; pocket squares appear on older men `[548399, 549812]`.
- **Office and business, warm season:** suits persist on older office men even in June
  `[551643, 551658, 551696, 554312]`. Younger and mid-career men switch to:
  - short-sleeve dress shirts (white, pale blue, pink, khaki) with dark or tan slacks
    `[551644, 551705, 554297, 554312, 554314]`
  - cream or tan sport coats `[554299, 548399]`
- **Sport coats:** camel/tan, windowpane check, houndstooth overcoats `[549323, 549855, 549876,
  551771]`.
- **Young men (under ~35):** long-sleeve patterned shirts with long collar points (paisley,
  floral, stripes, satin-look) worn open or with a wide tie `[548399, 549812, 551692]`.
  - Knit polos in bold horizontal stripes `[551696, 549921]`, solid knit polos with wide collars
    `[551688]`, chambray or navy work shirts `[551646]`.
  - Trousers: high-waisted flares, from cream/white `[549812, 554312]` to dark denim
    `[551669, 551770]`.
  - Jackets: denim, tan suede, brown leather and corduroy `[551699, 549859, 551770]`.
- **Cool-season outerwear:**
  - trench and raincoats (beige) `[549876, 549855]`
  - camel overcoats `[548257]`
  - peacoats and windbreakers `[549863, 551771]`
  - leather jackets `[551772]`
  - olive parkas `[551697]`
  - long overcoats below the knee on older men `[549855, 556685]`

### 3.2 Women's daywear
- **Trousers are as common as skirts for women under 45.** Wide flares or bell-bottoms are high
  at the waist and dragging over the shoe `[549863, 551651, 551687, 554314]`. Matching
  pantsuits come in strong single colours: red, rust, pink/lilac, burgundy `[548399, 551651,
  551699, 554314]`.
- **Summer skirts and dresses:**
  - knee-length shirtwaist and shirt-dresses (stripes, plaid, florals) `[551658, 551695, 551696,
    551651]`
  - A-line skirts 5–15 cm above the knee `[549921]`
  - minis at mid-thigh on under-25s `[549855, 551644]`
  - sleeveless shells and tanks `[551651, 551666, 551688]`
  - some midi and floor-length skirts `[551695, 551699]`
- **Tops:**
  - pointed-collar blouses (collar worn out over a sweater) `[551705, 548399]`
  - ribbed knits and turtlenecks `[549855, 551692]`
  - zigzag or chevron multicolour knits `[551688, 548268]`
  - gingham `[551687]`
  - puff-sleeve floral knit tees `[556824]`
- **Cool-season outerwear:**
  - belted trench (cream/beige) above or at the knee `[549855, 556677, 556685]`
  - long dark midi coats to mid-calf `[549855, 549882, 549863]`
  - suede, leather and vinyl hip and knee coats `[549855, 549866, 551697]`
  - shaggy long-pile or patchwork fur(-look) jackets on young women `[549863, 556685]`
  - crochet shawls `[551697]`

### 3.3 Older people (60+)
- **Women:**
  - set, curled or teased hair in white, blue-grey or ash blonde `[548268, 551658, 551773,
    551774, 548402]`
  - cat-eye or large frames `[548268, 551658]`
  - tweed and bouclé jackets and swing coats `[548268, 551774, 553822]`
  - floral or print sleeveless dresses to the knee in summer `[551658]`
  - matching plaid jacket and skirt `[551773]`
  - white low lace-ups or slip-ons, low pumps `[551658]`
  - handbags held on the lap or on the forearm `[548257, 551695, 551658]`
  - wire shopping carts `[551687]`
- **Men:**
  - suits even in heat, felt or straw hats with narrow-to-mid brims `[549812, 551642, 551643,
    554299]`
  - glasses, balding with slicked sides `[548402, 549323, 551658]`
  - newspapers `[551642, 551772]`
- **Behaviour:** they are over-represented among people **sitting** on ledges, benches and
  fountain rims `[551658, 551693, 551772, 551642]`.

### 3.4 Young people
- **Teens and twenties:**
  - long straight hair (both sexes) `[548397, 549916, 551651, 551666]`
  - afros `[549855, 549859]`
  - denim (flared jeans, denim jacket) `[551770, 551697]`
  - headscarf bands and kerchiefs `[551666, 551697]`
  - platform shoes `[551687, 556685, 549921]`
  - loud pattern on young adults: tartan suit, patchwork fur, chevron knit `[556685, 548268]`
- **Children** appear only in daytime family or group settings: playground, block party, youth
  group `[551641, 551667–551669, 551688, 551693]`.
  - Clothes: striped tees, shorts, tube socks with coloured bands, black canvas high-tops,
    turtlenecks, bowl cuts.
  - Adults always nearby.

### 3.5 Workers and uniforms (generic: no real insignia, crests or company names)
- **Garment trade:** men in shirt sleeves or T-shirts, pale-blue work shirts, grey or dark
  flared work trousers, wide belts. They push or pull:
  - chrome pipe garment racks `[549882]`
  - bolt carts with rope netting `[549867]`
  - two-wheel hand trucks `[549850]`
  - low dollies on a rope `[549851]`
  - basket carts `[549873]`

  **They walk in the traffic lane, not the sidewalk.** Shop and stock workers wear a light zip
  smock or jacket `[551779]`. The brief's "garment-trade smock" is **not seen** in the refs:
  (period knowledge, not from refs) cutters and pressers wore aprons or shop coats indoors.
- **Delivery and stock lunch crowd:** chambray or navy work shirts, jeans or black trousers,
  tan suede work boots, paper-bag lunch `[551646, 551666]`.
- **Street and municipal:**
  - signal worker in a white hard hat, dark knit shirt and sneakers `[554308]`
  - fountain maintenance in a yellow hooded slicker `[551664]`
  - curbside mechanic in tee, work trousers and boots `[555907]`
  - gas-station attendant in grey work clothes `[554354]`
- **Police (generic):** scooter traffic officers in light-blue short-sleeve shirts, dark
  trousers, white or pale-blue helmets, duty belts `[554293, 554354]`.
  - Foot patrol, sleeve patches, cap device: (period knowledge, not from refs).
  - **Do not reproduce any real patch, shield or crest.**
- **Transit and rail (generic):**
  - ticket agent: red vest over navy, patterned neck scarf, name badge `[556706]`
  - peaked-cap dark uniform `[556677]`
  - Subway token-booth clerks, bus drivers and conductors are not legible in the refs:
    (period knowledge, not from refs) bus drivers in grey or blue shirts with a peaked cap.
- **Sanitation:** **no legible sanitation worker in any photo.**
  - Garbage trailers and trucks appear without crews `[548410]`.
  - (period knowledge, not from refs) olive or green-grey work shirts and trousers, work gloves,
    heavy boots, a cap.
  - Keep it generic and leave off any department patch.
- **Doormen and porters** are named in the style guide but **not visible** in these refs:
  (period knowledge, not from refs) long dark coat or tunic with contrast trim and a peaked cap,
  generic.

### 3.6 Footwear
- **Men:**
  - black or brown leather lace-ups and loafers with suits `[549812, 548399, 551643]`
  - tan suede work boots `[551646, 551666]`
  - canvas sneakers and white sneakers `[551688, 551771, 554308]`
  - dark platforms on young men `[556685]`
  - Wingtips (named in the brief) are not resolvable at this size: (period knowledge).
- **Women:**
  - ankle-strap platform sandals in black or white `[549921, 551651, 554314]`
  - platform slingbacks `[556685]`
  - black patent mid-heel pumps `[549921, 549855]`
  - dark platform loafers `[551651]`
  - flat leather sandals `[551666, 554354]`
  - white low lace-ups on older women `[551658]`
  - brown platform shoes `[551697]`
- **Children:** black canvas high-tops `[551667, 551669, 551693]`.

### 3.7 Headwear
- **Older men (cool season):** narrow-to-mid-brim felt hats `[549855, 549812, 549873, 549876]`.
- **Older men (summer):** light straw or cloth hats `[551643, 554299]`.
- **Flat and driver caps on men 40+:** `[548268, 549882, 551771]` (white flat cap).
- **Women:** knit berets, tams and beanies in cool weather `[548257, 549859, 549863, 553822]`.
  - Wide-brim straw sun hats, one trimmed with silk flowers `[551695, 551699, 549323]`.
  - Headscarf kerchiefs and wide headbands `[551697, 551666]`.
  - A floppy dark brimmed hat on a young woman `[556685]`.
- **Young men:** occasional beret `[551666]`.
- **Most people under 40 are bare-headed, in every season** `[556684, 548399, 551651]`.
- Western-style straw hat once `[551688]`.

### 3.8 Hair and facial hair
- **Men under 35:**
  - collar-length to shoulder-length shag or straight hair covering the ears
    `[548397, 549812, 551646, 551666, 556685]`
  - curly mid-length `[551696, 549812]`
  - afros `[549859]`
- **Moustaches:** common on men 20–50 `[548399, 551646 (2 of 3), 551666, 551692, 548268]`.
  - Long sideburns `[549921]`.
  - Full beards rare (one possible `[548388]`).
- **Men over 50:** short back and sides, slicked or combed over, balding very common
  `[548402, 549873, 551658, 551688]`.
- **Women under 35:**
  - long straight centre-part dominates `[549863, 549916, 551651, 551666]`
  - shag with bangs `[551692, 551651]`
  - blunt bob with bangs `[549855, 556824]`
  - waist-length braid `[551651]`
  - high topknot `[551644]`
  - large afro `[549855]`
  - short natural hair `[551651, 556706]`
- **Women 40+:** set and teased curls, bouffant, flipped shoulder-length `[551643, 551687,
  551695 (copper), 551705]`.

### 3.9 Eyewear
Glasses are frequent, especially on people 40+.
- Large metal or plastic frames `[548268, 549855, 551692, 556706]`.
- Cat-eye frames on older women `[548268, 551658]`.
- Tinted aviators `[551651]`.
- Large tinted sunglasses on women `[548388, 553822, 551695]`.
- White-framed sunglasses on a man `[551692]`.
- Clear oversize round-square frames `[556706]`.
- Wire rims on young men `[549859]`.

### 3.10 Carried props
| Prop | Who | Refs |
|---|---|---|
| Newspaper (folded under the arm, or open and read hunched) | men 30+, idle older men | 549855, 551642, 551772, 554314, 556824 |
| Paper shopping bags (yellow, white, red), clear printed bags | women, all ages | 549855, 548257, 549921, 554308 |
| Handbag on short handles, lap or forearm | women 40+ | 548257, 551658, 551695, 551687 |
| Shoulder bag, long strap (or carried by the strap) | women under 40 | 549855, 551651, 549921, 556824 |
| Briefcase (hard shell, oxblood or black), set at the feet when standing | office men | 549812, 549882, 551771 |
| Rolled papers or drawing tubes | men and women | 548399, 549812, 549876 |
| Garment rack, bolt cart, hand truck, rope dolly | garment workers | 549850, 549851, 549867, 549873, 549882 |
| Wire two-wheel folding shopping cart | older woman | 551687 |
| Umbrella stroller (chrome, fringed canopy) | mothers | 551667, 551668 |
| Long umbrella, wooden crook handle | women, overcast days | 549855 |
| Brown paper-bag lunch, cans, plastic snack bags | workers, kids | 551641, 551646 |
| Cigarette | drivers, men on the street | 549851, 554299 |
| Canvas messenger bag, camera | men at events | 551692, 551688 |
| Hard suitcases, carryalls | rail travellers | 556677, 556685 |
| Portfolio or flat folder | young women | 549855, 551641 |

### 3.11 Posture, gait and body language
- **Walking:**
  - office men walk in a long, brisk stride with arms swinging `[549882, 548399]`
  - older women walk slower with the bag pinned at the elbow `[548257]`
  - young women walk upright, carrying the bag strap in the hand `[551651]`
  - workers lean into their carts `[549867, 549850]`
- **Standing:**
  - hands in pockets, arms folded, hands behind back, briefcase between the feet
    `[551771, 551696]`
  - hand on hip `[548397, 554314]`
  - leaning on a wall with arms folded `[551666]`
  - cab driver's elbow out of the window `[549869]`
- **Sitting (very common in warm refs):**
  - on fountain rims, planter ledges, low walls and steps
  - legs crossed with a newspaper (men), or knees together with a handbag on the lap (older
    women)
  - eating lunch from a paper bag `[551641, 551642, 551646, 551651, 551658, 551772, 551693]`
- **Crowd behaviour:**
  - curb clusters spill into the gutter and roadway `[548399, 549851, 549859, 554314]`
  - mid-block jaywalking through stalled traffic `[549863, 549868, 549849]`
  - tight queues at 30–60 cm spacing `[549855, 556685, 549921]`
  - shoulder-to-shoulder knots at doors and booths `[548268, 556684, 553822]`
  - loose 1–3 m spacing at plazas and street fairs `[551685, 551699]`
  - loitering clumps under the marquees on 42nd St `[554297, 549872]`

### 3.12 Colour palette
**About the film.** The scans are faded colour-slide film with a strong magenta/red shift: whites read
pink, navy reads plum. Raw pixel samples are given where the sample was clean, next to a
**corrected target** to use in-game. The corrected values are judgement calls, so treat them as
eyeballed. Tokens extend style guide §2 and do not clash with existing `cloth.*` tokens.

| Suggested token | Target hex | Raw scan sample | Source ids |
|---|---|---|---|
| `cloth.camel` (existing) | `#a07a52` | — | 549855, 548257, 551771 |
| `cloth.rust` (existing) | `#8e4a2e` | — | 553822, 551651 |
| `cloth.trench` | `#d8cfb8` | `#dbbdaf` | 549855, 556677, 556685 |
| `cloth.navy` | `#2e3550` | `#301f34` | 549323, 551692, 551696 |
| `cloth.suitCharcoal` | `#3a3a3e` | — | 548388, 549873 |
| `cloth.suitBrown` | `#5a3d2a` | `#391d24` | 551658, 551643 |
| `cloth.tieMaroon` | `#6e2228` | `#753333` | 548399 |
| `cloth.red70` | `#a8302e` | `#942d2f` / `#9a2e2c` | 551651, 551687, 551688, 551669 |
| `cloth.pinkPantsuit` | `#d6a0b8` | `#b06c85` | 554314 |
| `cloth.mustard` | `#c99a35` | `#c77d35` | 551651, 549859, 553822 |
| `cloth.harvestYellow` | `#d1a63a` | `#b97c33` | 551699, 551685, 551664 |
| `cloth.strawTote` | `#d9ac4a` | `#de9d42` | 551705 |
| `cloth.rustDress` | `#b0714a` | `#d28e72` | 551651 |
| `cloth.paleBlueFlare` | `#b9c3d0` | `#d5c2b5` | 551651 |
| `cloth.chambray` | `#9db0c8` | `#a99996` | 551646, 549867 |
| `cloth.royalBlue` | `#2f4f86` | — | 549916 |
| `cloth.olive` | `#5e5a2a` | — | 549921, 551641, 551697 |
| `cloth.tweedOat` | `#c4b48f` | `#ba9e8e` | 548268, 548402, 551774 |
| `cloth.fauxFurCream` | `#e3d8c6` | `#c99886` | 549863, 556685 |
| `cloth.oxblood` | `#6e2a1e` | `#7c2127` | 549812 |
| `cloth.khaki` | `#b0a080` | — | 551696, 554314 |
| `cloth.creamSportcoat` | `#d8cfc0` | — | 554299, 549812 |
| `cloth.denim70` (existing) | `#3c4a63` | — | 551669, 551770 (mid-blue `#4a5a7a` for kids' jeans) |
| `uniform.lightBlue` | `#9fb3cf` | — | 554293, 554354 |
| `uniform.railRed` | `#b03a2e` | `#b67252` (fluorescent) | 556706 |
| `workwear.slickerYellow` | `#c8962a` | `#904c2c` (shaded) | 551664 |

**Distribution, observed:**
- Cool season is about 70% dark (navy, black, brown, charcoal), 20% neutrals (camel, beige,
  cream, grey) and under 10% saturated (red coat, mustard knit) `[556684, 548388, 549855]`.
- Summer flips to about 45% light (white, cream, pale blue, pink), 30% mid or dark trousers and
  suits, and 20–25% saturated accents: red, mustard, yellow, royal blue, pink, multicolour prints
  `[551651, 551688, 554314, 554312]`.
- **Red is by far the most frequent saturated garment colour** in both seasons.

### 3.13 Wear and grime on clothing
**Honest limit:** at this resolution fabric wear is mostly **not resolvable**.
- **Seen:**
  - darkened, creased work clothes and a ground-level mat for street repair `[555907]`
  - worker shirts loose and untucked-looking `[549850, 549867]`
  - faded mid-blue denim on kids `[551669]`
  - trousers worn long, so the hem drags `[551651]`
- Office clothing in the refs reads clean and pressed `[548399, 551643, 551696]`.
- (period knowledge, not from refs) sweat-dark underarms and backs in summer heat, shiny seats
  on old suit trousers, frayed cuffs, scuffed toes, salt and dust on hems, cigarette burns,
  sun-faded shoulders. Apply wear mainly to workers, older and poorer archetypes and the idle
  park crowd. Keep office workers fairly clean.

---

## 4. Summer 1974 adjustments (period knowledge, not from refs, unless an id is given)
The refs already cover June and August **1973** well. These are the deltas for July and August
**1974**:

- **Heat dressing:**
  - more men in shirtsleeves without jackets than in `[551643]`
  - sleeves rolled
  - collars open with no tie for under-40s
  - undershirts or vests visible at the neck on older working men
  - jackets carried over the shoulder
- **Polyester double-knit** slacks and short-sleeve print shirts with long collar points; knit
  "body shirts". Short-sleeve shirts seen in `[554314, 556824]` support this.
- **Leisure suit:** emerging in 1974 and **rare**. Peak is 1975–76. Cap it at about 2% of men.
- **Women:**
  - halter tops and tube tops (young women)
  - wrap dresses: **rare**, just introduced in 1974
  - sundresses, gauze and peasant blouses
  - culottes and gaucho pants (both rare)
  - denim cutoffs
  - clogs and espadrilles alongside the platforms already seen in `[549921, 551651, 554314]`
- **Young men:**
  - T-shirts (plain, ringer, or with invented iron-on designs; no brands)
  - tank tops
  - cutoffs
  - tube socks with sneakers (seen on kids `[551667]`)
  - open shirts with a thin chain
  - bandanas
  - afro picks in the hair
- **Avoid as anachronisms:**
  - the 1977 white disco suit look
  - mood rings (1975)
  - designer-jeans branding (late 1970s)
  - running and jogging gear as streetwear (late 1970s)
  - visible logos of any kind
  - mirrored "cop" sunglasses: fine in moderation
- **Rain:** summer storms bring out trench coats and folding umbrellas. See the puddles in
  `[549882, 554299]`.
- **Tenderloin mix:**
  - garment-district workers on weekdays
  - Penn Station and bus-terminal travellers with luggage
  - 42nd Street loiterers at night
  - office lunch crowds in Bryant Park
  - residents of the West 30s walk-ups (Puerto Rican, Dominican, Black, Greek, Irish, Italian,
    Jewish and Chinese New Yorkers)

  All of them are dressed as ordinary people of their age and job, **never as caricature or
  costume**.

---

## 5. Generator implications

**Frequencies** are rough shares of adult pedestrians on a **weekday daytime midtown street in
July 1974**. They come from the warm refs `[548399, 551643, 551651, 551696, 554312, 554314,
549921]` with the §4 deltas applied. Tune per district and time. "P" marks a value that is
(period knowledge, not from refs).

### 5.1 Population mix
| Parameter | Value | Basis |
|---|---|---|
| Sex mix, weekday avenues | 60–70% men | 549851, 549873, 549876, 551771, 551772 |
| Sex mix, plazas, fairs, shopping | 40–50% men | 551651, 551685, 551699, 548268 |
| Age 18–35 / 36–59 / 60+ | 40 / 40 / 20% | 548399, 551658, 551772 (seniors over-represented when seated) |
| Children | <3% on avenues, 15–25% at playgrounds and block parties, always with adults | 551667–551669, 551688 |
| Skin tone and hair texture | full range, no single default | 549855, 551646, 551651, 556706, 556824 |

### 5.2 Men's garments
| Garment | Share of men | Parameters |
|---|---|---|
| Suit (2- or 3-piece) | 25% (rising to 60% of men over 50) | lapel width 9–12 cm; gorge low; jacket length to mid-seat; trouser hem flat 23–27 cm (slight flare); trouser break full to long. Colours: navy, charcoal, brown, grey, tan `[548399, 549812, 551643]` |
| Sport coat with slacks | 10% | camel, cream, check or houndstooth `[548399, 554299, 549323]` |
| Short-sleeve dress shirt, no jacket | 35% | collar point 8–10 cm; white, pale blue, pink, khaki `[554312, 554314, 556824]` |
| Long-sleeve shirt, sleeves rolled or open collar | 15% | collar point 9–12 cm; paisley, floral, stripe, satin-look `[548399, 549812, 551692]` |
| Knit polo or striped tee | 10% | wide flat collar; broad horizontal stripes `[551696, 551688, 549921]` |
| T-shirt or tank | 5% (workers, young) | `[549850, 555907]`; P for tanks |
| Work shirt (chambray or navy) with jeans or work trousers | 8% | `[551646, 549867]` |
| Leisure suit | ≤2% | P |
| Tie, when worn | 10–12 cm wide, often patterned or maroon | `[548399, 551771]` |
| Trouser shape, under 35 | high rise (waist at the navel), slim through the thigh, flare from the knee; hem flat 26–32 cm (jeans) and 25–28 cm (slacks) | `[549812, 551669, 551651]` |

### 5.3 Women's garments
| Garment | Share of women | Parameters |
|---|---|---|
| Wide flares or bells (incl. pantsuits) | 35% | waist at the natural waist or higher; hem flat 30–40 cm; length to the floor over the shoe `[549863, 551651, 551687]` |
| Matching pantsuit | 10% of the above | solid red, rust, pink, burgundy `[548399, 551651, 554314]` |
| Dress, knee-length (shirtwaist, sleeveless print, stripe) | 25% | hem −5 to +5 cm from the knee; ages 35+ `[551658, 551696, 551695]` |
| Skirt or dress above the knee | 15% | hem 5–15 cm above the knee (A-line); mini 15–25 cm above, under 30 only `[549921, 549855, 551644]` |
| Midi or maxi skirt | 7% | hem 10–20 cm below the knee, or floor length `[551695, 551699]` |
| Shorts or hot pants | 3–5% | mid-thigh or shorter; under 30 only; non-sexualised `[551666, 551685]` |
| Tops | — | pointed-collar blouse, sleeveless shell, ribbed knit, puff-sleeve tee, halter (P) `[551651, 551705, 556824]` |

### 5.4 Shared and outerwear
| Item | Share | Parameters |
|---|---|---|
| Summer outer layer | 10% | trench or raincoat on overcast or rainy days; jacket over the arm or shoulder `[549916, 551771]` |
| Cool-season layer (for spring and autumn missions) | trench 25% / dark overcoat 30% / midi coat (W) 15% / leather or suede 10% / parka or windbreaker 10% / fur(-look) jacket on young W 5% | coat lengths: hip, knee, mid-calf `[549855, 549863, 556685]` |
| Pattern on top garment | 30% solid-light, 35% solid-dark, 20% stripe or plaid, 15% bold print or floral | warm refs |

### 5.5 Footwear and headwear
| Item | Share | Parameters |
|---|---|---|
| Women's shoes | platform sandal or slingback 30%, mid-heel pump 25%, flat sandal 20%, low lace-up or slip-on (60+) 15%, clog 5% (P), sneaker 5% | platform height 3–6 cm sole, 8–11 cm heel `[549921, 551651, 556685]` |
| Men's shoes | leather lace-up or loafer 65%, work boot 15%, sneaker 15%, platform 5% | `[551646, 551688, 556685]` |
| Hats | men 60+: 30% (straw or cloth in summer, felt in cool season); men 40–59: 10% (flat cap); under 40: <5%. Women: 5% straw sun hat in summer, 20% knit cap or beret in cool season | brim 4–6 cm on men's hats `[549855, 551642, 554299, 551695]` |

### 5.6 Hair and eyewear
| Item | Share | Parameters |
|---|---|---|
| Men's hair, under 35 | collar-length shag 45%, ear-covering straight 20%, short 20%, afro 10%, curly mid 5% | `[551646, 549812, 549859]` |
| Men's facial hair, 20–50 | moustache 30%, long sideburns 30%, beard 5% | `[548399, 551646, 549921]` |
| Women's hair, under 35 | long straight centre-part 40%, shag 20%, bob 15%, afro or natural 10%, braid or ponytail 10%, updo 5% | `[551651, 549855]` |
| Women's hair, 50+ | set or teased curls 70%; colours white, grey, ash, copper | `[548268, 551658]` |
| Eyewear | 40+: 45%, under 40: 20%; frame scale 1.2–1.5× modern; sunglasses in summer 15% | `[548268, 551651, 556706]` |

### 5.7 Props, behaviours and colour
| Item | Share | Parameters |
|---|---|---|
| Props | newspaper 15% (men), handbag 70% (women), shopping bag 20%, briefcase 10% (office men), cigarette 10% visible, cart or rack 3% (garment blocks 15%), umbrella 5% (overcast) | §3.10 |
| Idle behaviours | sit on ledge, read newspaper hunched, lunch from bag, hands in pockets, arms folded, hands behind back, lean on wall, hand on hip, elbow out of car window, curb-spill wait, mid-block jaywalk | §3.11 |
| Queue spacing / plaza spacing | 0.3–0.6 m / 1–3 m | `[549855, 551685]` |
| Saturation budget | ≤25% of figures carry a saturated colour; red first, then mustard or yellow, then royal blue or pink | §3.12 |
| Wear | workers and the idle crowd: medium to heavy (sweat, dust, fade); office: light | `[555907]` + P |

**Uniform templates** (all generic, with **no real patches, shields or lettering**):
- scooter or traffic police `[554293, 554354]`
- foot police (P)
- rail agent `[556706]`
- peaked-cap rail or bus staff `[556677]` + P
- hard-hat city worker `[554308]`
- slicker maintenance worker `[551664]`
- sanitation (P)
- doorman (P)
- youth group `[551641]`, using invented colours and badges in-game rather than the real ones

---

## 6. Hard rules reminder
- **No real brands or logos** on any garment, bag, cap or prop. The refs show store names,
  product billboards, company names on trucks and a corporate name carved into a plaza wall.
  **None of these are to be copied.** Invented names only, as in style guide §4.
- **No likeness of real people.** The observations above describe clothing and types, never
  individuals. Do not model any face, body or outfit-plus-face combination on a specific person
  in these photos. Posters and billboards of real or modelled faces `[556664, 554298, 554307]`
  are excluded from this study.
- **Respectful representation.**
  - Variety comes through skin tone, build, age, hair and dress, never caricature.
  - The refs show a mixed city (dark, medium and light skin; afros, straight, curly and braided
    hair; young and old) side by side in the same queues and plazas `[549855, 551651, 551646]`.
    Generate the same.
  - No group is tied to a single job, outfit or behaviour.
  - Children appear only in daytime family or group contexts, never in adult settings.
  - Nothing sexualised: short hems and shorts are ordinary summer wear and are posed as such.
- **Uniforms are generic.** They take colour and cut from the refs, never insignia.
