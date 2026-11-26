# NARRATIVE_PROGRESS: Tenderloin '74 narrative team

Source of truth for the narrative team. Read it first at the start of every session and
update it last. The brief is `NARRATIVE_BRIEF.md`, and engine status is in `PROGRESS.md`.

## Status
| Phase | State |
|---|---|
| N1. Story bible | **Approved** (after reviews 1–3) → `narrative/N1_STORY_BIBLE.md` |
| N2. Cast | **Done** (with appearance sheets; no review objections) → `narrative/N2_CAST.md` (generated from `content/cast/*.json`) |
| N3. Story structure | **Done** → `narrative/N3_STRUCTURE.md` (32-mission chain, branches, endings, relationships, act-by-act world) |
| N4. Mission specs and side activities | **Done.** All 32 missions in `content/missions/`; 20 side activities in `content/activities.json`; M1 fully playable. Validator: 0 errors (104 warnings = dialogue scripts due in N5). |
| N5. Dialogue and barks | **In progress.** Done: Act 1 dialogue (M1–M9, 32 scripts), 53 NPC archetypes, 21 bark pools (477 lines; 12 core pools with 31+ each). Next: Act 2 dialogue (M10–M21), then Act 3 (M22–M32), then activity dialogue. |
| N6. Ambient world and business registry | — |
| N7. Integration | — (waits on engine Phase 7 hooks) |

## Files
```
NARRATIVE_PROGRESS.md      this file (status, decisions, open questions, SOURCES, critiques)
narrative/N1_STORY_BIBLE.md  premise, loglines, pillars, PC, social geography, acts, timeline
narrative/N2_CAST.md       GENERATED cast sheets; edit content/cast/*.json and re-run the tool
narrative/tools/cast.py    validates the cast (line length, 24h schedules, ids, edges, places) and renders N2_CAST.md
content/cast/*.json        cast source of truth: leads, principals, secondary
content/boundaries.json    map-edge blockers, invented film shoot and agencies, edge barks (with the oversight BOUNDARIES design)
narrative/N3_STRUCTURE.md  acts, chapters, 32-mission chain, branches A/B, endings, relationship rules, world changes by act
narrative/tools/content.py validates missions, dialogue, triggers, spawns, interiors and flags; renders content/FLAGS.md
narrative/tools/build_act1_missions.py  authoring source for Act 1 mission JSON (edit here, re-run)
content/missions/, content/dialogue/, content/triggers/, content/spawns.json, content/interiors.json, content/flags.json (+ FLAGS.md)
content/activities.json    20 side activities (pool rows keyed by placeholder), built by narrative/tools/build_activities.py
narrative/tools/build_act23_missions.py  authoring source for M10–M32 mission JSON
content/npc_archetypes/    53 archetypes (contract shape), built by narrative/tools/build_archetypes.py
content/barks/             21 bark pools, built by narrative/tools/build_barks.py
narrative/tools/dlg_act1.py  authoring source for Act 1 dialogue (M2–M9)
content/places.json        narrative place ids (loc.*) pinned to real intersections and block faces
ENGINE_REQUESTS.md         capabilities needed beyond the draft hook contract, with fallbacks
content/                   (from N4 on) machine-readable missions, triggers, dialogue, etc.
```
`src/` and `tools/` are engine-owned, and the narrative team doesn't touch them.

## Branch note
`NARRATIVE_BRIEF.md` and the engine's Phase 1 were committed on
`claude/tenderloin-74-engine-qi54lt`, not on `main`. The narrative branch
(`claude/sharp-maxwell-jnb6hr`) was fast-forwarded onto it so it carries the engine docs
and `public/data/world.json`.

## Review log
**26 Nov 2026, N1 review 1.** The reviewer said:
- Teddy stays the lead.
- **Three totally different playable leads**, in the spirit of rotating-lead open-world
  games, converging for key missions and **introduced one at a time through the first
  half**.
- **Sensitive subjects are fine. Prostitution should be present in the world.**

Applied in the bible:
- Delphine Moore (§3b) and a third lead (§3c) added.
- A 32-mission rotation table (§6.0): Delphine arrives in M6, the third lead in M15, all three are
  playable by M17, and there are 10 joint missions.
- Sensitive-subject handling rules rewritten (§7).
- ENGINE_REQUESTS #5 (switching leads).

**26 Nov 2026, N1 review 2.** The reviewer said: *"Cut Ezra. Make him a rich business man."*
Applied:
- Ezra Lomax was removed completely (including the gay double-life storyline and the
  photo-blackmail thread).
- The third lead is now **Nikos "Nick" Varelas**, 51, a self-made Kastorian fur magnate who
  is cash-poor, pays everyone, and is the buyer of record of the Corwin (bible §3c).
- Augie Lomax stays as the trucking boss, with no son.
- Missions 15–32 were re-pointed to Nick: his vaults fail on the first brownout, he meets
  Delphine over a lease, and the three-lead vault job becomes his insurance scheme.
- A name check found no notable real "Nikos/Nick Varelas" in the fur trade. Real fur houses
  at 143 and 210 W 29th St are noted, and those addresses are off-limits for invented
  businesses.

**26 Nov 2026, N1 review 3.** The reviewer said: *"All your calls. Begin N2."*
- **Branch A approved:** in M12, Teddy wears Calloway's wire or burns it.
- **Branch B approved:** in M29, who gets the ledger (the prosecutor, the tenants and the
  press, or Teddy keeps it).
- No third branch: two is enough, and the brief allows two or three.

**26 Nov 2026, coordination.** The user confirmed they set up the **oversight session**
(`session_01H4ZSJ99NBvPVUNdV2re88V`) and told me to follow its suggestion. (Its own
correction: it relays the user's decisions word for word and coordinates the streams.
Content calls stay with the user and each stream, and format and contract calls stay with
the engine.) and that the map is being expanded
(talk to the oversight session for details). Requests taken from it:
- **Appearance sheets** for the Characters workstream. They're now an `appearance` block on
  all 3 leads and 12 principals: build, height, skin tone and hex, hair and hex, face,
  posture, gait, mannerisms, and wardrobe per act. Validated by `cast.py`.
- **Boundary content** for `docs/briefs/BOUNDARIES.md` (layer 2). Now in
  `content/boundaries.json`:
  - the invented film shoot NIGHT RATE (Kettle & Crane Pictures);
  - the invented utility Hudson Union Steam & Power, plus three invented city bodies;
  - 12 blockers with act and time rules;
  - 78 barks (32 of them for the barricade cop).

  Placements are provisional until the bounds are confirmed.
- **Edge rule:** no mission, tail or chase within one block of an edge. ENGINE_REQUESTS #6
  lists the story locations that need the expanded bounds.
- Name checks: "Night Rate" (no 1970s film by that title), Hudson Union (no such utility),
  and Kettle & Crane (chosen after "Lamplight" and "Halyard" turned out to be real
  production companies). The Audio workstream will consume N5 barks and N6 radio content.

**26 Nov 2026, standing instruction** (the user's words, relayed by oversight): *"Yes, keep
each chat pushing to its next milestone."* Work continuously through N2 → boundaries → N3 →
N4 (opener and Act 1 chain first, for the engine's vertical slice). Commit and push at each
step. Stop to ask the user only about scope cuts, sensitive-subject changes, or real people
and licences. Creative calls are mine ("All your calls") and get logged here.

**Engine responses (ENGINE_RESPONSES.md on the engine branch):** requests 1–5 were all
ACCEPTED. The bounds are final (E4): west mid-block 10th–11th, north 47th–48th, east
Lexington–3rd, south 18th–19th. Missions keep 60 m inside the edge. The Dyer Ave tunnel
trench is now playable terrain. Terrain relief (E1) is proposed, so missions mustn't depend
on flat ground. Answers to the engine's asks (lead spawns, clock range) are filed in
ENGINE_REQUESTS.

## Current proposal
- **Leads:** Teddy Arce (ex-cop, night clerk: *access*), Delphine Moore (former presser,
  works the Eighth Ave strip and banks the women's savings club: *reading people, photo
  evidence, on foot*), Nick Varelas (fur magnate, buyer of record of the Corwin: *money
  and leverage, night driving, rich interiors*).
- **Premise:** a post-Knapp syndicate rebuilds the payoff "pad" as legal-looking
  paperwork. Each lead is one moving part of it: Teddy collects, Delphine's club gets
  taxed, Nick pays.
- **Dramatic question:** Can you protect your block when every kind of protection is for
  sale, without becoming the one who sells it?
- **Pillars:** P1 Follow the money · P2 The grid is the game · P3 Everybody's on a shift
  · P4 Owed, not owned · P5 The city is running out.
- **Acts:** 1 "Dusk" (M1–9, 21 Jun–4 Jul) · 2 "Heat" (M10–21, to 7 Aug) · 3 "Resignation"
  (M22–32, to Labor Day) · Epilogue "October".

## Still awaiting the reviewer
1. N2 cast review (see the self-critique below).
2. ENGINE_REQUESTS #1 (calendar) and #5 (switching leads) are needed for the structure
   as designed. Both have fallbacks.

## Decisions made (narrative-side)
- **Calendar:** 21 Jun 1974 (Friday, solstice) to 2 Sep 1974 (Labor Day), plus an
  epilogue on 1 Oct 1974. Weekdays checked against the 1974 calendar.
- **No real person is named, even as background.** The mayor, the President, union
  leaders and commission members are referred to only by office. The 1974 WTC
  high-wire walk is left out.
- **Real brands are referred to generically** until N6 assigns cleared invented names:
  "the Herald Square department store", "the power company", "the city's tabloids".
- **The period nickname for the Eighth Avenue strip is not used.** It evoked runaway
  minors, which our content rules keep entirely out of the game.
- **In-world brownouts are invented.** Research found no documented summer-1974
  Manhattan brownouts. What it did find was the utility's own projection of negative
  reserve margins for Aug–Sep 1974 [S15]. The game's brownouts are framed as plausible
  invention, not history.
- **The 1975 crisis events are foreshadowing only.** Fear City, mass layoffs and the
  sanitation strike [S18] don't happen in 1974.
- **Three-lead rules:** each lead gets a solo mission before any joint one; joint missions carry the act turns; no ending requires one lead to kill another.
- **Crews are defined by trade, not ethnicity.** The trucking combine, the plainclothes
  unit, the SRO syndicate and the arcade operators are all mixed. Every community in the
  district has legitimate, sympathetic principal or secondary characters (enforced in N2).

## Open questions / research to do in N2–N3
- `flag.act3_started` (used by `content/boundaries.json`) must go into `content/FLAGS.md` when
  that file is created in N3/N4.
- Which 1974 side-street one-ways the engine assumes (DATA_SOURCES says OSM today). This
  matters for the street-race and tail missions, so I'll check with the engine team.
- Whether there was a 1974 Hotel Pennsylvania convention calendar (a texture detail, low
  priority).
- Detailed 1974 Garment District trucking practices (sources are thin, [S4]). I want
  oral histories before writing the Carriers' Association missions.
- Radio landscape in 1974 (AM Top 40 vs FM soul/salsa formats). The sources found so far
  [S19] cover genres, not station formats. All stations will be invented anyway.

---

## SOURCES
Each period claim that drives a story beat is listed here. Secondary sources are flagged.

- **[S1] Knapp Commission:** founded 1970; preliminary report Aug 1972, final Dec 1972;
  "grass-eaters" (passive, opportunistic) vs "meat-eaters" (actively seeking gambling
  and drug payoffs); recommended commander accountability and Internal Affairs field
  offices. Sources: [Wikipedia, Knapp Commission](https://en.wikipedia.org/wiki/Knapp_Commission);
  [EBSCO Research Starters](https://www.ebsco.com/research-starters/politics-and-government/knapp-commission);
  [John Jay College, NYPD oversight](https://lib.jjay.cuny.edu/nypd/oversight).
  *Drives:* Teddy's backstory, the post-pad vacuum, Mayhew.
- **[S2] Office of the Special Prosecutor:** created by executive orders on 19 Sep 1972,
  acting on the Knapp recommendation, with jurisdiction over corruption in the NYC
  criminal justice system (dissolved 1990; sources conflict on the exact year).
  Sources: [NY State Archives finding aid](https://findingaids.nysed.gov/do/873f53b7-f26e-5111-9921-e1c53a9e8a80);
  [NY Law Journal retrospective](https://law.com/newyorklawjournal/2019/10/29/remembering-the-tumultuous-years-under-special-prosecutor-maurice-nadjari).
  *Drives:* Calloway, Branch A. (The real official who led the office is **not** depicted.)
- **[S3] Fiscal crisis:** heavy short-term borrowing; by 30 June 1974 almost all FY73–74
  appropriations were spent; from Oct 1974 a plan to close a roughly $1.5B gap; cash ran
  out in spring 1975. Sources: [SEC chronology (1977)](https://www.sechistorical.org/collection/papers/1970/1977_0826_SECNewYorkBChronology.pdf);
  [Wikipedia, 1975 NYC fiscal crisis](https://en.wikipedia.org/wiki/1975_New_York_City_fiscal_crisis).
  *Drives:* P5, the epilogue, newspapers.
- **[S4] Garment District:** streets used as freight arteries, congested with trucks;
  racks pushed by hand through the street; long manufacturing decline. Sources:
  [Skyscraper Museum, Urban Fabric](https://old.skyscraper.org/EXHIBITIONS/URBAN_FABRIC/nw16.php);
  [Wikipedia, Garment District](https://en.wikipedia.org/wiki/Garment_District,_Manhattan);
  [Gotham Center, Garment Industry History Project](https://www.gothamcenter.org/garment-industry-history-project).
  *Thin on 1970s trucking specifics. More research is needed before N4.*
- **[S5] Garment workforce:** Puerto Rican women's low-wage labour kept the industry
  going into the 1960s; Dominican women followed; about 25,000 Chinese garment workers
  in NYC by 1980, more than 80% women. Sources:
  [ILWCH, "Sweatshops Here and There"](https://cambridge.org/core/journals/international-labor-and-working-class-history/article/sweatshops-here-and-there-the-garment-industry-latinas-and-labor-migrations/C0ABF034E31C445068355742C81016A5);
  [Labor Arts, "We Are One"](https://www.laborarts.org/?p=241194).
  *Drives:* Carmen Arce, the loft-shop subplot.
- **[S6] SRO decline and J-51:** the J-51 tax incentive (from 1955) encouraged converting
  SRO units; critics said owners used it to remove SRO tenants, including through
  harassment. Sources: [Supportive Housing Network of NY, history](https://shnny.org/learn-more/what-is-supportive-housing/history-of-supportive-housing/);
  [Fordham Urban Law Journal](https://ir.lawnet.fordham.edu/ulj/);
  [Sullivan & Burke, "SRO Housing in NYC: Origins and Dimensions of a Crisis"](https://queerspace.commons.gc.cuny.edu/files/2020/05/SINGLE-ROOM-OCCUPANCY-HOUSING-IN-NEW-YORK-CITY_-THE-ORIGINS-AND-DIMENSIONS-OF-A-CRISIS.pdf).
  *Drives:* the Lisle syndicate, the Corwin plot.
- **[S7] Welfare hotels near Herald Square:** a Broadway hotel near 32nd St was renting
  to the city for emergency housing from the early 1970s (sources say 1970 or 1973).
  Sources: [Hospitality Net, hotel history](https://www.hospitalitynet.org/opinion/4112153/nobody-asked-me-but-no-270-hotel-history-hotel-martinique-1910).
  *Drives:* the welfare-hotel belt. The real hotel isn't used. The Corwin is invented.
- **[S8] 42nd Street and Eighth Avenue:** the Deuce's grindhouses and 1970s low point;
  sex businesses on Eighth Ave; later cleanup through eminent domain. Sources:
  [Untapped Cities](https://untappedcities.com/2019/08/21/10-seedy-remnants-of-gritty-old-times-square-you-can-still-see-today/);
  [Criterion, Times Square on film](https://www.criterion.com/current/posts/8549-how-the-movies-captured-times-square-s-grimy-golden-age);
  [CUNY dissertation on the Deuce](https://academicworks.cuny.edu/gc_etds/6066).
  *Popular-history sources. Verify against the CUNY dissertation before N6.*
- **[S9] Penn South:** an ILGWU-sponsored limited-equity co-op between Eighth and Ninth
  Aves, W 23rd–29th, occupied from May 1962. Sources: [Wikipedia, Penn South](https://en.wikipedia.org/wiki/Penn_South);
  [Cornell ILR, ILGWU](https://ilgwu.ilr.cornell.edu/announcements/16.html).
  *Drives:* Carmen's home.
- **[S10] Early Korean presence:** in the 1970s–80s Korean wholesalers clustered between
  24th and 34th Sts, Fifth to Sixth; a Korean restaurant opened in midtown in 1972; the
  32nd St strip proper grew later (late 1970s–80s; sources disagree). Sources:
  [Wikipedia, Koreatown Manhattan](https://en.wikipedia.org/wiki/Koreatown,_Manhattan);
  [Macaulay CUNY, Koreatown: Evolution](https://eportfolios.macaulay.cuny.edu/seminars/gardner07/articles/e/v/o/Koreatown%7E_Evolution_b853.html).
  *Drives:* a small, early Korean presence only. There's no "Koreatown" in 1974.
- **[S11] Flower District:** wholesalers on W 28th St since the late 1870s; about 60 shops
  at the 1970s peak; trade begins around 5 a.m. Sources:
  [NYC Historic Floral District](https://thursd.com/articles/james-francois-pijuan-nyc-historic-floral-district);
  [Medium, NYC Flower District](https://medium.com/nyc-flower-district/deforestation-in-manhattans-midtown-jungle-6d95ba7221a1).
  *The shop count is approximate.*
- **[S12] Fur District:** 27th–30th Sts, Sixth to Eighth; Kastorian Greek furriers
  replaced the aging Jewish furriers after the Greek Civil War; 800 manufacturers in
  1979. Sources: [6sqft, NYC fur trade](https://www.6sqft.com/from-beavers-to-banned-the-history-of-new-york-citys-fur-trade/);
  [Wikipedia, Fur industry in Kastoria](https://en.wikipedia.org/wiki/Fur_industry_in_Kastoria).
  *Summer cold storage of customers' coats is common furrier practice; I still need a
  period source before the vault mission (N4).*
- **[S13] Bryant Park:** by the early 1970s largely taken over by drug dealers and avoided
  by office workers; restored 1988–92. Sources:
  [Bryant Park Corp., history](https://bryantpark.org/blog/history-of-bryant-park-modern-times);
  [APA Great Places](https://planning.org/greatplaces/spaces/2010/bryantpark.htm).
- **[S14] State drug laws:** signed 8 May 1973, effective 1 Sep 1973, with mandatory
  minimums (for example 15-to-life for possession of 4 oz of narcotics). Sources:
  [Wikipedia, Rockefeller Drug Laws](https://en.wikipedia.org/wiki/Rockefeller_Drug_Laws);
  [NPR (2013)](https://www.npr.org/2013/02/14/171822608/the-drug-laws-that-changed-how-we-punish).
  *Drives:* informant pressure on small dealers.
- **[S15] Power utility in 1974:** the 1974 fuel bill was about $800M against $300M in
  1973; the second-quarter dividend was omitted on 23 Apr 1974, the first omission in
  roughly 90 years; the utility asked customers to conserve; June 1974 filings projected
  negative reserve margins for Aug (−475 MW) and Sep (−68 MW) 1974. Sources:
  [Time, "Shock from Con Ed"](https://content.time.com/time/magazine/article/0,9171,943685,00.html);
  [Richmond Fed Economic Review 1974](https://www.richmondfed.org/-/media/RichmondFedOrg/publications/research/economic_review/1974/pdf/er600401.pdf);
  [NRC docket](https://www.nrc.gov/docs/ML0936/ML093630665.pdf).
  *No documented 1974 Manhattan brownouts were found, so the game's brownouts are invented.*
- **[S16] Presidential resignation:** televised address on the evening of Thu 8 Aug 1974,
  effective Fri 9 Aug 1974. This is common knowledge; I'll add a citation in N3.
- **[S17] Subway in 1974:** 35¢ fare (raised in 1972); deferred maintenance; graffiti
  rising, with more than 1,400 transit arrests in 1973 and more than 2,000 in 1974.
  Sources: [nycsubway.org, the TA in the 1970s](https://nycsubway.org/wiki/The_New_York_Transit_Authority_in_the_1970s);
  [DPLA / EPA DOCUMERICA photo caption](https://dp.la/item/1ff217eafe098d99c2b54830c0d3395b).
- **[S18] 1975 events (out of scope for 1974):** the police cuts and the "Fear City"
  pamphlet (June 1975), the 1975 sanitation strike, and the vacancy freeze and merit
  halts under the new administration. Sources:
  [NYRB review of *Drop Dead City*](https://www.nybooks.com/articles/2025/06/26/the-vanishing-mr-beame-drop-dead-city/);
  [Macaulay CUNY seminar page](https://eportfolios.macaulay.cuny.edu/seminars/napoli09/index-54799.html).
- **[S20] Runaway shops:** garment work fled New York for the South, and later the
  Caribbean and beyond, in the postwar decades; relocation deepened racial segregation of
  the jobs. Sources: [Battle, "On the Auction Block", ILWCH (2022)](https://doi.org/10.1017/s0147547922000059);
  [Freeman, *Working-Class New York*, ch. 9](https://rodriguez21lpol301.commons.gc.cuny.edu/wp-content/blogs.dir/17962/files/2021/10/Working-Class-New-York-Joshua-Freeman-Chap-9.pdf).
  *Drives:* Delphine's backstory.
- **[S21] (Unused since review 2, when Ezra was cut; kept for reference.) Policing of gay New Yorkers around 1974:** entrapment for cruising was curtailed
  in the late 1960s; bar raids continued after Stonewall (for example the 1970 Snake Pit
  raid); serious harassment had become less common by the early 1970s. Sources:
  [NCJRS abstract, police harassment 1960–1980](https://ojp.gov/ncjrs/virtual-library/abstracts/police-harassment-homosexual-women-and-men-new-york-city-1960-1980);
  [OutHistory, Gay Bars and Antigay Policing](https://outhistory.org/exhibits/show/docsw/docsw1);
  [Gay City News, Corruption before and after Stonewall](https://gaycitynews.com/corruption-before-after-stonewall/).
  *Drives:* Ezra's threat is private blackmail and exposure, not routine arrest. Raid
  frequency for 1971–75 is still unverified, so no raid is set in 1974 without a source.
- **[S19] Music in 1974:** disco emerging from New York and Philadelphia club culture in
  1974; salsa at a creative peak after the early-1970s club and stadium concerts.
  Sources: [Carnegie Hall, salsa's New York history](https://carnegiehall.org/Explore/Articles/2024/12/20/Salsas-New-York-History);
  [Carnegie Hall timeline, disco](https://timeline.carnegiehall.org/genres/disco).
  *Genre texture only. All songs, artists and stations in the game are invented.*

---

## Phase N1 self-critique

**Against the pillars**
- P1 (Follow the money) is the backbone of the premise. The risk is that it becomes
  abstract ("ledgers") and stops being tactile. N3 has to make each collection a
  person handing over something they need.
- P2 (The grid) is served by the walk up Broadway and the trade-by-block geography. I
  haven't yet designed a mission that really *depends* on 1974 one-ways; that work is in
  N3/N4. The engine's side-street directions are also assumed rather than verified.
- P3 (Shifts) is strong in the geography table. Schedules come in N2.
- P4 (Owed) has stated themes but no defined relationship mechanics yet (which numbers
  move, and what thresholds do). That's needed in N3.
- P5 (Running out) is well grounded for money and power. Rooms (SROs) are strong.
  "Running out of time" needs to be shown through act-by-act world changes.

**Against the content rules**
- All characters, crews, the hotel and the precinct are invented. Real institutions
  appear only by office. No real individual is named, but I left the real Special
  Prosecutor's name in a SOURCES URL slug, which is fine for research notes and must
  never reach `content/`.
- Real brands: the bible refers generically to the department store and the utility.
  No invented brand has been cleared yet. The Corwin, the Seventh Avenue Carriers'
  Association and the other names are **provisional** until the N6 search.
- Risk of stereotype: the trucking combine and the arcade operators are archetypes with
  long ethnic-coding traditions in crime fiction. The fix is in N2: make leaders and
  members cross-community, and give every community at least one dignified principal.
- Sex work and the drug trade are handled through people with goals. The beats that need
  sign-off are listed rather than assumed.

**Against the mobile rules**
- The core loop (walk, drive, deliver, tail, talk, photograph) needs no precise aim. The
  premise deliberately makes Teddy a non-gunman.
- The opening walk-and-talk is long. On a phone it needs checkpoints (Flatiron → 28th St
  → 34th St) and must never require keeping pace exactly with an NPC.
- Brownout nights reduce visibility, so objectives need lit landmarks and strong HUD text
  on dark blocks to stay readable on a small screen.

**Weakest part:** the antagonist Lisle risks being a "suit in an office" who can't appear
in an open world. N2 should give him a daily route (lunch at a fixed counter, a walk to
the courthouse buses, a car with a driver) so the player can tail and photograph him.

**N1 outcome:** approved after three reviews. Teddy is the lead, with three converging
leads; the third lead was changed to Nick Varelas; both branches were approved.

---

## Phase N2 self-critique

**What was delivered:** 3 leads, 12 principals and 26 secondary characters (41 in total).
Each has an id, age and birth year, origin, occupation, want, need, secret, speech pattern
with three subtitle-safe sample lines, home and haunts at real intersections, a 24-hour
weekday schedule, relationship edges (156, weighted −3 to +3), an act arc, a wardrobe and
silhouette brief with a palette, and mission appearances. `narrative/tools/cast.py`
enforces the brief's mechanical constraints. I tested it by injecting five faults and it
caught all five.

**Against the pillars**
- P1 (Follow the money): every principal is placed on the payment graph as a payer,
  collector, banker or ledger-keeper. Three people now hold independent copies of the
  evidence (Kearney's Christmas list, Marjorie's carbons, Wurtz's locker). That gives N3
  several routes to the ledger and stops Branch B from being a single point of failure.
- P2 (The grid): every haunt and schedule entry is a real intersection or a pinned block
  face. **Gap:** `content/places.json` puts invented businesses on real block faces without
  checking what stands there in the engine's footprints. N4 must check each one against
  `world.json`, and must avoid live businesses at real addresses (I've noted the real fur
  houses at 143 and 210 W 29th St).
- P3 (Shifts): every character has a working day. The three leads' hours barely overlap
  (Nick by day, Teddy at night, Delphine late night), which suits switching. The cost is
  that joint missions must be set at the edges of shifts (dawn, dusk, brownout nights).
  M9, M18 and M32 already are.
- P4 (Owed): the edges seed the save-state `relationships`. **Missing:** what moves the
  weights, and the thresholds that change outcomes. That belongs in N3.
- P5 (Running out): Feld's runaway shop, Nick's double pledge, Calloway's funding deadline
  and Augie's illness all run on clocks.

**Against the content rules**
- All 41 characters are invented. A web check of the principal names found no notable
  real namesakes. While drafting I renamed three secondaries whose original names belonged
  to real public figures. Secondary names weren't web-searched one by one; they're common
  name combinations with no fame attached. **Risk accepted:** re-check before ship.
- Representation audit: every community in the district has sympathetic principals or
  secondaries in legitimate trades: Puerto Rican (Carmen, Navarro, Inez), Black American
  (Odessa, Calloway, Marcus, Delroy), Greek (Yiannis, Eleni), Korean (both Baeks), Chinese
  (Mei-lin), Italian (Moretti, a legitimate florist who refuses the pad, not a mobster),
  Jewish (Ostrow, Feld) and Irish (Kearney). Corrupt figures are spread across
  backgrounds. One fix was made in this phase: Claudette was changed from a hotel-bar
  worker to a chambermaid, so the sex-work cast isn't drawn mostly from one group and the
  club reads as a working women's bank. **N5/N6 must** keep the ambient sex-worker
  archetypes mixed in background.
- Sex work: Delphine, Tina and Rita (retired) are written with goals, humour and money
  sense. The pimp, Lonnie, has a motive (debt) and is deliberately unglamorous. Nothing
  sexual appears in any sample line or schedule.
- Minors: Inez's children are referenced only. They have no ages on file, and a rule keeps
  them off the map during M26. Dwayne is 19.
- Drugs: Ricky is a person under the 1973 laws, not a mechanic. There's no use gameplay.
- Real institutions only by office: the Special Prosecutor's office, the ILGWU (Carmen's
  union), the furriers' union, the Public Library. The department store and the newspaper
  stay generic until N6.

**Against the mobile rules**
- Every sample line is 90 characters or fewer (enforced), and none depends on audio.
  Objective-text limits (40 characters) apply in N4.
- Schedules give the NPC system fixed, findable positions (for example Lisle at
  12:40 at the luncheonette), so tails and meets can rely on map knowledge rather than
  fast reflexes.

**Weak spots to fix in N3**
- Ruth Calloway and Nora Finch both want the ledger, and their roles overlap. N3 should
  give them opposed constraints, so Branch B is a real choice between two flawed outlets.
- Nick has few warm relationships (Eleni +2, Yiannis +1). That's on purpose, but his
  playable arc needs at least one non-transactional bond. Candidate: Odessa, after M30.
- Mayhew has the richest backstory but appears in only 10 missions. The 1971 secret needs
  mid-game seeding (Act 2), not just the M25 payoff.

**N2 outcome:** carried on under the standing instruction. Appearance sheets were added at
the Characters stream's request.

---

## Phase N3 notes
The self-critique is in `narrative/N3_STRUCTURE.md` §9. Creative calls made under "All your
calls":
- Branch B has four outcomes, including **B4 "Ashes"**, a complete bleak ending for players
  who closed both doors.
- Lead resolutions (Tina, the Corwin's fate, the lease) are labelled as resolutions, not
  extra branches.
- The Corwin can be given for $1 to an invented non-profit (the West Midtown Housing
  Council). This is Nick's non-transactional bond with Odessa.
- Calloway and Finch now have opposed constraints: a live witness and a September deadline,
  against two corroborations and an editor's conflict.
- The open order for M23–M25 gives Act 3 some player freedom.

## Phase N4 progress
- **Act 1 (M1–M9)** is specced to the contract, plus the extensions in ENGINE_REQUESTS 8.
  Every objective's text is 40 characters or fewer, names a real place and was validated.
- **M1 is playable end to end** once the engine hooks exist: 7 dialogue scripts, an
  overheard trigger, spawns (including `spawn.player_start` at the prow, matching
  `world.json`), and interior markers for the Corwin.
- **Validator results:** 0 errors. 25 warnings, all for dialogue scripts scheduled for N5.
  The validator caught one real mobile-rule break (M4 had too few checkpoints for its
  length), which is now fixed.

---

## Phase N4 self-critique
**What was delivered:**
- **32 story missions** to the contract (plus the extensions in ENGINE_REQUESTS 8): giver,
  requirements (flags, act, time window, weather, date range), start trigger, objectives,
  fail states, checkpoints, rewards, flags, relationship changes, dialogue references,
  locations by intersection or place id, NPCs, archetypes, vehicles, and a mobile note.
- **20 side activities** (ENGINE_REQUESTS 9).
- **M1 is fully playable:** dialogue, trigger, spawns and interiors.
- **Validator:** 0 errors. It checks every objective's text (40 characters or fewer, and
  activities after substitution); checkpoint density (at least one per 5 minutes, and 3+ for
  missions over 12 minutes); references (characters, places, interiors, flags, scripts,
  triggers, unlocks); two pillars per mission; and the mobile notes.

**Against the pillars**
- P2 is weakest in the Act 3 dialogue missions (N3 §9). I added a movement leg to each: M22
  has the Times Square radio crowd and the drive to the Pennsylvania; M24 has a cross-town
  drive; M29 has the hand-over trip. They're still the least "grid" missions.
- P1 is everywhere, and literal in M9 (Delphine follows her own money) and in the
  Collections activity.
- P4 has real mechanics now: relationship gates fire in M18 (Yiannis's count), M24
  (Villalba), M26 (Manny, Gus), M30 (council) and M32 (Delroy's cab).

**Against the content rules**
- Hollis's death (M19) is off screen, and the camera rule is written into the spec.
- M26 can't end in a fire (failing restarts it), and the children are explicitly elsewhere.
- Sex work is context only (the club rounds, Walk Her Home). Photo Jobs subjects are petty
  fraudsters, never intimate targets.
- The numbers game and the drug trade are non-functional: no odds, recipes or instructions.
- The real presidential resignation is radio background with an invented narration, and no
  person is named.
- The ice-cream activity caps truck speed near children.
- All names stay provisional until the N6 search.

**Against the mobile rules**
- No objective needs precise aim (photos auto-frame).
- Every chase is an `evade` solved by two-door buildings or one-ways.
- Switch points sit only at calm beats.
- Branch choices are untimed and have a confirm step.
- Long missions (M18, M32) have five checkpoints.
- Every objective text names a real place.

**Risks and gaps**
- Act 3 leans on several contract extensions (`if`, `optional`/`onComplete`,
  `missionsDone`). Each has a fallback, but if the engine refuses them, M21, M29 and M27
  become variant missions (more files, the same story).
- The 104 dialogue scripts referenced (about 900–1,200 lines) are the bulk of N5.
- Ambient NPC archetypes (`npc.*`) are referenced but not yet defined. They're due in N5,
  with the barks.
