# NARRATIVE_PROGRESS: Tenderloin '74 narrative team

Source of truth for the narrative team. Read it first at the start of every session and
update it last. The brief is `NARRATIVE_BRIEF.md`, and engine status is in `PROGRESS.md`.

## Status
| Phase | State |
|---|---|
| N1. Story bible | **Draft done, awaiting review** → `narrative/N1_STORY_BIBLE.md` |
| N2. Cast | — (blocked on N1 review) |
| N3. Story structure | — |
| N4. Mission specs and side activities | — |
| N5. Dialogue and barks | — |
| N6. Ambient world and business registry | — |
| N7. Integration | — (waits on engine Phase 7 hooks) |

## Files
```
NARRATIVE_PROGRESS.md      this file (status, decisions, open questions, SOURCES, critiques)
narrative/N1_STORY_BIBLE.md  premise, loglines, pillars, PC, social geography, acts, timeline
ENGINE_REQUESTS.md         capabilities needed beyond the draft hook contract, with fallbacks
content/                   (from N4 on) machine-readable missions, triggers, dialogue, etc.
```
`src/` and `tools/` are engine-owned, and the narrative team doesn't touch them.

## Branch note
`NARRATIVE_BRIEF.md` and the engine's Phase 1 were committed on
`claude/tenderloin-74-engine-qi54lt`, not on `main`. The narrative branch
(`claude/sharp-maxwell-jnb6hr`) was fast-forwarded onto it so it carries the engine docs
and `public/data/world.json`.

## Proposal summary (for review)
- **Premise:** Teddy Arce is an ex-patrolman purged in the Knapp aftermath for petty
  "grass-eating" and now works the night desk at an SRO hotel. He's pulled into a
  post-Knapp syndicate that is rebuilding the payoff "pad" as legal-looking paperwork
  (legal fees, trucking surcharges, SRO conversions).
- **Dramatic question:** Can you protect your block when every kind of protection is
  for sale, without becoming the one who sells it?
- **Pillars:** P1 Follow the money · P2 The grid is the game · P3 Everybody's on a shift
  · P4 Owed, not owned · P5 The city is running out.
- **Acts:** 1 "Dusk" (21 Jun–4 Jul) · 2 "Heat" (5 Jul–7 Aug) · 3 "Resignation"
  (8 Aug–2 Sep) · Epilogue "October" (1 Oct 1974).
- **Alternatives considered:** "The Courier", "Wire", "Night Desk". All three are folded
  in as mechanics, a branch and the hub.

## Decisions awaiting the reviewer
1. **Approve the premise and protagonist**, or pick an alternative logline.
2. **Branch points.** Two candidates are sketched: A, wear the wire or burn it; B, who
   gets the ledger. The brief says to ask before adding branching points. I'm asking
   now so N3 can build on them. A possible third: C, whether Teddy sides with the
   Corwin tenants or the garment operators when the Act 3 march splits.
3. **Sensitive beats** (bible §7): the heat death at the Corwin, the arson threat,
   Marisol's Eighth Avenue storyline, the heroin market in Bryant Park, and the
   presidential resignation as backdrop. Each has a proposed handling and a fallback.
4. **Date-driven world.** The story assumes the game knows the calendar date (newspapers
   per week, holidays, brownout nights). This is filed as ENGINE_REQUESTS #1, with a
   flag-based fallback.

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
- **Crews are defined by trade, not ethnicity.** The trucking combine, the plainclothes
  unit, the SRO syndicate and the arcade operators are all mixed. Every community in the
  district has legitimate, sympathetic principal or secondary characters (enforced in N2).

## Open questions / research to do in N2–N3
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

**Stop.** N1 is ready for review. N2 (Cast) starts once the decisions above are answered.
