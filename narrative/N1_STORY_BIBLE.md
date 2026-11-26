# Tenderloin '74: Story Bible (Phase N1)

> Status: **draft for review**. Every name here is provisional. Character names get a
> collision check in N2, and business names get a trademark search before they go into
> `BUSINESS_NAMES.md` (N6). Each period claim marked **[S#]** is backed by an entry in the
> SOURCES section of `NARRATIVE_PROGRESS.md`, and anything marked **(invented)** is ours.

---

## 0. The pitch package

### Working title
**TENDERLOIN '74** (the engine's title). The in-world name for the story is *"The Pad"*.

### Logline (recommended)
> Summer 1974. An ex-cop thrown off the force in the Knapp-era purge, who took free
> coffee while the real money moved over his head, now works the night desk of a
> dying SRO hotel. The men who walked away clean are rebuilding the old payoff
> machine. This time it runs through lawyers, trucks and vacate notices instead of
> envelopes, and his hotel is the first thing it wants to eat.

### Three alternative loglines (not chosen; kept for review)
1. **"The Courier."** A Garment District truck driver has carried the trucking combine's
   envelopes for years without opening one. Then his route boss is killed, and he
   finds he's the only person who knows the whole route. A delivery-driving game
   about a man who learns what he's been carrying.
   *Why not:* strong driving loop, but the story lives mostly inside one trade and
   doesn't use the whole district.
2. **"Wire."** The Special Prosecutor's office sends a disgraced patrolman back to his
   old precinct wearing a wire, with a deal: three cases and his record is wiped.
   *Why not:* a tight thriller, but it locks the player into one side. We keep it as
   a **branch** inside the chosen premise (see Act 2).
3. **"Night Desk."** A hotel clerk at a Herald Square welfare hotel tries to keep 200
   residents housed through one summer of heat, brownouts and harassment.
   *Why not:* the most humane option, but it's too static for an open-world crime game.
   It becomes the chosen premise's **home base and its heart**.

The recommended logline folds all three together: the courier's route knowledge,
the wire as a temptation, and the night desk as the thing worth protecting.

### Premise (one paragraph)
In June 1974 New York is running out of money, out of trust and, on the worst nights,
out of power. Two years after the Knapp Commission broke the NYPD's organised
payoff system (the "pad") **[S1][S2]**, the Tenderloin's gambling, after-hours,
trucking and real-estate rackets have lost their referee. **Teodoro "Teddy" Arce**,
34, was a patrolman in the district until 1972. He was named in an internal
proceeding for petty "grass-eating" (free meals and a Christmas envelope) and
resigned rather than testify against his partner, who testified against everyone
else and kept his badge. Now Teddy works nights behind the bulletproof glass of the
**Hotel Corwin** (invented), a 14-storey single-room-occupancy hotel on West 31st
Street. It's the only job he could get, and it comes with a room. Over one summer a
quiet syndicate rebuilds the pad in a legal-looking form. Payoffs go in as "legal
fees", "trucking surcharges" and "relocation bonuses", and vacated SRO hotels come
out the other end as tax-abated conversions **[S6]**. The syndicate needs a civilian
who knows every block and every cop, and who has nothing left to lose. Teddy has
something left: his mother at Penn South, the 200 residents of the Corwin, and the
one clean thing he did. By Labor Day he decides who the new machine belongs to, or
whether it gets built at all.

### Central dramatic question
**Can you protect the people on your block in a city where every kind of protection is
for sale, without becoming the one who sells it?**

The question is asked in three registers, and every act turns one of them:
- *Personal:* Is Teddy a grass-eater who got unlucky or a decent man who got caught?
- *Neighbourhood:* Who will the Tenderloin's residents, workers and hustlers pay, now
  that the old pad is gone?
- *City:* What gets sold off when a city runs out of money?

---

## 1. Tone and themes

**Tone.** A 35mm crime film from the street, not from the penthouse. It's procedural
and patient, warm with the people and cold with the systems. Violence is sudden,
ugly and consequential rather than choreographed. Humour comes from working people
talking to each other: it's dry, profane (implied), multilingual and tired. The
palette matches the engine's: sodium orange, wet black asphalt, steam from manholes,
the neon of 42nd Street smeared in fog, the green of a hotel lobby's fluorescent
tube, and the fierce dusk light along the cross streets.

**Reference register (in feel only, never imitated):** the 1970s New York street
procedural, the paranoid conspiracy thriller, and the working-class ensemble drama.
No scene, character or line imitates a specific film.

**Themes**
1. **Corruption doesn't end. It changes clothes.** The envelope becomes an invoice.
   The bagman becomes a consultant. Reform pushes graft upstairs, into paperwork.
2. **Debt as a social bond.** Everyone owes someone: rent, protection, a favour, a
   life. The game tracks those ledgers (`relationships`) and makes them matter.
3. **Work as identity.** Cutter, pushboy, florist, furrier, night clerk, hack: people
   are introduced by their shifts. The city still works while it falls apart.
4. **Who the city is for.** The fiscal squeeze, SRO conversions and the empty midtown
   lofts all ask whether poor and working people get to stay in Manhattan **[S3][S6]**.
5. **Witness.** Teddy saw things as a cop and said nothing. The player's camera,
   ears and choices turn witnessing into action, or into silence.

---

## 2. Pillars (every mission must serve at least two)

| # | Pillar | What it means in a mission | Test question for designers |
|---|---|---|---|
| P1 | **Follow the money** | Every mission moves value from one person to another (cash, goods, rooms, favours, testimony), and the player sees who pays and who collects. | *Whose money is this, and where does it end up?* |
| P2 | **The grid is the game** | Route knowledge, 1974 one-ways, real addresses and time of day are the challenge. Twitch accuracy is not. Directions are given the way New Yorkers give them. | *Could a player who learned the streets do this better than one with fast thumbs?* |
| P3 | **Everybody's on a shift** | The people involved are workers with a schedule, and the mission happens inside their working day (5 a.m. flowers, 7 a.m. garment trucks, the 11 p.m. desk shift). | *What was this person doing before the player showed up?* |
| P4 | **Owed, not owned** | Choices shift debts between Teddy and the cast. Nobody's loyalty is free, and every favour is remembered. | *Who owes whom after this, and will it come back?* |
| P5 | **The city is running out** | Scarcity of money, light, time, rooms and trust raises the stakes. The world visibly gets thinner as the summer goes on. | *What's in short supply here?* |

Hard rule: no mission exists only for spectacle. A car chase is a chase **after
someone's money** along **real one-ways**, by someone **coming off a shift**.

---

## 3. The player character

**Teodoro "Teddy" Arce** (char.teddy_arce). This is a summary; the full sheet comes in N2.
- 34. Born in Mayagüez, Puerto Rico, in 1940. Came to New York at eight and grew up
  on West 26th Street. His mother, **Carmen Arce**, is a sewing-machine operator and
  ILGWU member who lives in Penn South, the union-sponsored co-op on Eighth Avenue
  **[S9]**.
- Army 1958–61 (peacetime; stationed in West Germany). NYPD 1964–72, patrolman, on
  Midtown foot posts and later in a radio car. He knows every super, doorman, hack
  stand and after-hours door between 23rd and 42nd.
- **Sin, on the record:** free meals, a cut of the precinct's Christmas "collection",
  and looking the other way at a numbers spot. That makes him a grass-eater by the
  Commission's own taxonomy **[S1]**.
- **Sin, off the record (his secret):** one night in 1971 he drove his partner to a
  meet and waited in the car. He has never admitted to himself what that meet was.
- He resigned in October 1972 rather than testify against that partner,
  **Sgt. Carl Mayhew**. Mayhew then testified against six other men and kept his badge.
- Now: night desk clerk at the Hotel Corwin, W 31st St between Broadway and Sixth Ave,
  from 23:00 to 07:00. He has a room on the 9th floor, an air-conditioner that doesn't
  work, and a hack licence he hasn't renewed.

**Why he stays in the Tenderloin**
1. **Carmen.** His mother is 61. She's three years from her pension and won't move
   to Puerto Rico or the Bronx.
2. **The Corwin.** 200 residents: pensioners, merchant seamen between ships, men on
   disability, a few working women, two families placed by the welfare department.
   He's the only staff member who knows all their names. If the hotel is emptied,
   most of them have nowhere to go **[S6][S7]**.
3. **Nobody else will hire him.** An ex-cop with a corruption file is distrusted on
   both sides of the counter, so the Tenderloin's in-between economy is the only one
   with room for him.
4. **Unfinished business.** Mayhew walked, and the meet in 1971 is still in the car
   with him.

**Playable verbs, as the story uses them:** walk and talk, drive (hack, truck,
borrowed car), tail, deliver, photograph (photo mode), listen (overheard dialogue),
choose (dialogue), plus very occasional, avoidable fighting. Teddy is not a gunman.
His weapons are a ring of keys, a phone book's worth of favours and the grid.

**The opening (earning the spawn shot).** It's dusk on Friday 21 June 1974, the
solstice, and sunset is around 20:30. Teddy stands at the north prow of the Flatiron,
facing up Broadway. He's been asked to meet someone there "where you used to stand
your post". The first mission is a **walk-and-talk north up Broadway from 23rd to
Herald Square** as the streetlights come on. It establishes the wholesale strip, the
flower and fur blocks to the west, the Empire State lit ahead, the welfare hotels,
and finally the Corwin. The person who asked him there is Mayhew. He has an offer.

---

## 4. Social geography (who controls, works and lives where)

The engine region runs from about 19th to 44th St and from Eighth/Ninth Ave to Park
Ave South. Real blocks, invented occupants. **Day** is roughly 07:00–19:00 and
**Night** is roughly 19:00–05:00.

| Zone (real blocks) | Day: who works here | Night: who's here | Who "controls" it in 1974 (invented) | Story use |
|---|---|---|---|---|
| **Madison Square / Flatiron** (23rd–26th, Fifth to Park Ave S; the Broadway–Fifth crossing) | Insurance clerks in the tower offices; the toy trade around Fifth & 23rd; lunch crowds in the park | Benches with sleepers, chess players, men drinking from bags; slow cab traffic down Fifth | Nobody, which makes it neutral ground. Meets happen here. | Opening; meet point; Act 3 finale staging |
| **The Broadway wholesale strip** (Broadway, 24th–31st) | Importers and jobbers in novelties, luggage, wigs, cheap jewellery; hand trucks on the sidewalks; the first few Korean-run wholesale shops on the side streets toward Fifth **[S10]** | Shuttered roll-gates, fluorescent office windows, a few old hotels | **The Lisle syndicate** buys the old hotels one by one | Delivery side jobs; the hotel-buying plot |
| **Flower District** (W 28th St, Sixth to Seventh) | Starts around 04:30–05:00. Wholesale florists (about 60 shops at the 1970s peak) **[S11]**; sidewalk jungles of potted palms; trucks from New Jersey | Locked, damp and quiet. Water running in gutters. | The **florists' association** (legit) and a flower-truck tax collected by the trucking combine | Dawn missions; the Act 2 chase through the potted jungle |
| **Fur District** (W 27th–30th, Sixth to Eighth) | Fur cutters and nailers, many from Kastoria, Greece, who replaced the earlier Jewish furriers after the late 1940s **[S12]**; slow in summer; cold-storage vaults hold customers' coats | Storage vault compressors humming; private guards | Family firms. The vaults are the prize. | Act 2 brownout heist: fur vaults in a power cut |
| **Garment District** (W 35th–40th, Sixth to Ninth; Seventh Ave is "Fashion Avenue" in spirit) | Manufacturers, cutters, pressers; pushboys with racks of dresses in the street; double-parked trucks; Jewish and Italian old-timers, Puerto Rican, Dominican and Chinese operators **[S4][S5]** | Lofts dark; some piecework shops lit illegally late; truck yards on the far west side | **The Seventh Avenue Carriers' Association** (invented): a trucking combine that decides who gets to deliver | Act 1–2 core: trucks, the "surcharge" pad, sweatshop subplot |
| **Herald Square** (34th St, Broadway & Sixth) | The department store, shoppers, commuters from PATH and the subway; hustlers working the crowds | Theatre-sized crowds after store hours thin out; the welfare hotels nearby light up **[S7]** | Store security; uniformed foot posts. The squares are always "covered". | Pickpocket side activity; crowd tails; Act 3 rally |
| **The welfare-hotel belt** (Broadway & Fifth, 28th–32nd) | Residents with nowhere to go during the day; caseworkers; the Corwin's day clerk | The Corwin's night desk, Teddy's world | **The Lisle syndicate** owns three hotels by July and wants six | Home base. The Corwin is our hub interior. |
| **Koreatown-to-be** (W 32nd St, Fifth to Broadway) | Wholesalers; one Korean restaurant (invented, following the real pattern of a 1972 opening nearby **[S10]**); a travel agent; an import office | Quiet; one lit sign | Nobody yet | Secondary cast; ambient; a family that came in 1971 |
| **Penn Station / MSG** (Seventh to Eighth, 31st–33rd) and **Hotel Pennsylvania** (Seventh Ave at 33rd) | Commuters, porters, redcaps, cab lines; the hotel's convention trade | Event nights at the Garden (invented fight cards and concerts); cab queues on Seventh; ticket scalpers | **Cab-line starters and the scalpers' ring** | Cab-fare side activity; Act 2 meet in the hotel ballroom |
| **The Post Office block** (Eighth Ave, 31st–33rd) | Postal workers on three shifts | The night shift: mail trucks on 31st and 33rd all night | The postal workers themselves | Night ambient; a secondary character's shift |
| **Penn South / Chelsea edge** (Eighth to Ninth, 23rd–29th) and **Hotel Chelsea** (W 23rd, Seventh to Eighth) | Union co-op families; retirees; the 23rd St shops | Stoops, radios, domino tables; artists and drifters drifting toward the old hotel | Nobody. It's home. | Carmen's apartment; the "safe" pocket of the map |
| **Eighth Avenue strip** (Eighth Ave, 34th–44th) | Lunch counters, bus-station foot traffic, cheap hotels | Bars, peep arcades, massage parlours, street sex work, hustlers, police sweeps **[S8]** | **Ray Bauer's arcades** (invented), with the surviving plainclothes unit "taxing" them | Act 2: Marisol's storyline, with dignity (see §7) |
| **42nd Street, "the Deuce"** (Seventh to Eighth) | Office workers cutting through; grindhouse box offices open at 10:00 **[S8]** | 24-hour cinemas, arcades, food stands, dealers, marquees burning in the fog | Theatre leaseholders, the arcade operators, and a numbers bank behind a shoeshine stand | Act 3 tail sequence; marquee text; ambient |
| **Bryant Park** (40th–42nd, Fifth to Sixth) | The library's readers and office lunches | A drug market under the trees **[S13]**; the park becomes the edge of the map at night | Street dealers working under the 1973 drug laws' mandatory minimums **[S14]** | Act 2–3: the plainclothes "conditions" unit's hunting ground |
| **The station house** (invented "Midtown Central", W 31st St between Seventh & Eighth) | Day tour; civilian complaints at the front desk | Night tour; the plainclothes squad comes and goes by the back door | **Lt. Dennis Wurtz's plainclothes unit** (invented) | Interior; Act 1–3 confrontations |

**Social map of power (who pays whom at the start of Act 1)**
```
                     Howard Lisle (counsel, the architect)
                    /            |                     \
     SRO hotel buyers    Seventh Ave Carriers' Assn.     Lt. Wurtz's plainclothes unit
     (vacate & convert)  ("trucking surcharge")          ("conditions" sweeps on 8th Ave,
            |                     |                        Bryant Park, the Deuce)
       Corwin residents    manufacturers, florists,            |
                           furriers, Korean wholesalers   arcades, dealers, numbers bank
                                                               |
                                          Sgt. Carl Mayhew  ←  needs a civilian collector
                                                               = TEDDY
       Opposition (fragmented): the Special Prosecutor's investigator (Ruth Calloway),
       the Corwin tenants' committee, the cab drivers, the garment operators, Marisol's circle.
```

---

## 5. Antagonist and principal forces (sketch; full cast in N2)

- **Howard Lisle** (char.howard_lisle). A former assistant DA who became real-estate and
  "trade association" counsel. He understood Knapp better than the cops did: an
  envelope is evidence, and an invoice is a business expense. He is building the
  new pad out of retainer agreements, J-51 conversions **[S6]** and trucking
  surcharges. He is polite, has never touched a gun, and believes he is *cleaning up*
  the Tenderloin.
- **Sgt. Carl Mayhew** (char.carl_mayhew). Teddy's old partner. He testified, kept his
  badge, and is hated in the station house. He needs to be useful to someone powerful
  or he'll be eaten. He is the "meet in 1971".
- **Lt. Dennis Wurtz** (char.dennis_wurtz). Runs the plainclothes "conditions" unit. He
  is a meat-eater who learned to wear gloves.
- **Ruth Calloway** (char.ruth_calloway). An investigator with the Special Prosecutor's
  office (the office is a real institution, created 1972 **[S2]**; she is invented and
  holds no real post). She is underfunded and stubborn. She wants Teddy to wear a wire.
- **Augie Lomax** (char.augie_lomax). Dispatcher-boss of the Carriers' Association. A
  former driver who believes the surcharge keeps "outsiders" off the streets.

---

## 6. Act structure (rough; detailed in N3)

The story spans **Friday 21 June to Monday 2 September 1974 (Labor Day)**, plus an
epilogue in October. Three acts and an epilogue, with about 30 story missions.

### Act 1: "Dusk" (21 June – 4 July). About 9 missions.
*Teddy agrees to "just carry messages".*
- Mayhew's offer on the walk up Broadway. Teddy says no.
- The Corwin gets a sale notice. The new owner's counsel is Lisle.
- Teddy takes cab fares, garment deliveries and a photo job to make rent for a
  resident. Every job brushes against the surcharge.
- Teddy says yes to Mayhew, to buy the Corwin time. Act 1 ends on **4 July** with
  his first collection run, done during the holiday when the district is empty.
- World state: clear evenings, long dusks, busy Garment District, few closures.

### Act 2: "Heat" (5 July – 7 August). About 12 missions.
*Teddy becomes the bagman, and discovers what he's carrying.*
- Collection runs across trades: florists at 05:00, furriers at noon, the arcades
  at midnight.
- Calloway approaches Teddy. **Branch point A (candidate, needs approval): wear the
  wire, or burn it.**
- Brownout nights (invented, consistent with the power company's real projected
  August shortfall **[S15]**): blocks go dark, and in the fur vault heist the
  compressors stop.
- Marisol's storyline on Eighth Avenue: the plainclothes "tax" and what women on the
  strip do about it.
- A Corwin resident dies in the heat after the new owners cut the hotel's power to
  "upgrade the wiring". **(Sensitive: needs sign-off. See §7.)**
- World state: humid, more rain and overcast; streetlights out on brownout nights;
  Corwin floors boarded up; vacate graffiti; more police on 8th Ave.

### Act 3: "Resignation" (8 August – 2 September). About 9 missions.
*The President resigns on the radio, and every small boss in the Tenderloin wonders
who'll go down with whom.*
- Real background: the presidential resignation (evening address 8 Aug, effective
  9 Aug) **[S16]** plays on every radio and front page. No real person appears or is
  named. In-world, it starts a panic of plea deals and pre-emptive betrayals.
- Lisle moves to close the whole syndicate before Labor Day. Mayhew wavers.
- **Branch point B (candidate, needs approval): who gets the ledger?** The Special
  Prosecutor; the tenants and the press (an invented paper); or Teddy keeps it, and
  becomes the pad.
- The finale is a Labor Day night run from the Garment District to the Flatiron,
  ending where the game began.
- World state: late-summer haze; some businesses shuttered; tenants' posters
  everywhere (or vacate notices, depending on choices); the Garment District
  quieter after the holiday.

### Epilogue: "October" (in-world date 1 October 1974, free roam)
The city announces a budget gap of about $1.5 billion **[S3]**. The newspapers
change, the Corwin is either full, empty or Teddy's, and the free-roam world
reflects the ending.

### Endings (candidates, decided in N3)
1. **Testimony:** Lisle indicted, Teddy testifies, the Corwin saved but Teddy
   exiled from the district. (Clean but lonely.)
2. **The Ledger Goes Public:** a scandal; the syndicate scatters; the plainclothes
   unit is disbanded; Teddy keeps his place but loses Calloway's protection.
3. **The New Pad:** Teddy keeps the ledger and runs the Tenderloin's money "fairly".
   The Corwin is safe because he owns the people who would have emptied it. The game
   frames this as a tragedy, never as a power fantasy.

---

## 7. Sensitive subjects: handling rules and beats needing sign-off

Per the brief, these beats **need approval** before N3 builds on them:

| Beat | Real-world subject | Proposed handling |
|---|---|---|
| Teddy as a former cop named in corruption proceedings | Knapp-era NYPD corruption **[S1]** | All individuals, cases and the precinct are invented. The Commission and the Special Prosecutor are referred to as institutions only, and no real officer or official is named or implied. |
| Marisol's Eighth Avenue storyline | Street sex work; police extortion | Marisol is an adult with her own goals (saving to get her sister's family out of a welfare hotel; organising the women to stop paying the "tax"). Nothing sexual on screen; the camera never leers. No minors in any part of this storyline. **We avoid the period nickname for the Eighth Ave strip because it evoked runaway minors.** |
| A Corwin resident dies after the power is cut | Heat deaths; SRO harassment | The death happens off screen and is discovered, then mourned. It is never a gameplay mechanic. It's invented, and modelled on the general pattern of SRO landlord harassment **[S6]**, not on any real case. **Alternative if refused:** the resident survives after a hospital run (a timed driving mission). |
| Arson threat to the Corwin | SRO arson for profit was a real pattern | The threat is designed so the player prevents it (a stake-out). No fire with casualties on screen. **Ask before including at all.** |
| Heroin market in Bryant Park | Addiction; 1973 drug laws **[S14]** | Dealers and users are people; there is no player drug use and no drug-making detail. The drug laws come through as a pressure that turns small dealers into informants. |
| Presidential resignation as Act 3 backdrop | A real political event | Radio and newspaper texture only. No named or depicted real person. Characters react, but the plot never depends on real officials. |
| Mention of the 1974 WTC high-wire walk (7 Aug) | A real living person | **Proposed: leave it out entirely.** The skyline is enough. |

---

## 8. Timeline: summer 1974

Legend: **REAL** = documented background (with source); **INV** = invented story event.
Days of the week were checked against the 1974 calendar.

### Before the game
| Date | R/I | Event |
|---|---|---|
| 1962 | REAL | Penn South co-op opens on Eighth Ave, sponsored by the garment workers' union **[S9]** |
| 1964 | INV | Teddy joins the NYPD |
| 1970 | REAL | The mayor appoints the Knapp Commission to investigate police corruption **[S1]** |
| 1971 (autumn) | INV | Teddy drives Mayhew to the "meet" and waits in the car |
| Aug 1972 / Dec 1972 | REAL | Knapp Commission preliminary report (Aug) and final report (Dec), which distinguish "grass-eaters" from "meat-eaters" **[S1]** |
| 19 Sep 1972 | REAL | Executive orders establish the Special Prosecutor for the NYC criminal justice system **[S2]** |
| Oct 1972 | INV | Teddy resigns; Mayhew testifies and stays |
| 1972 | REAL | The subway fare rises to 35¢, where it stays through 1974 **[S17]** |
| 8 May 1973 / 1 Sep 1973 | REAL | The state's drug laws are signed and take effect, with mandatory minimums **[S14]** |
| 1973 | INV | Lisle leaves the DA's office and opens a practice at an invented address on Fifth Ave in the 30s |
| 1973–74 winter | REAL | Oil embargo; fuel costs soar for the city's power utility **[S15]** |
| 1 Jan 1974 | REAL | A new mayor takes office (never named in game); the city is already borrowing short-term to cover operating costs **[S3]** |
| 23 Apr 1974 | REAL | The city's power utility omits its quarterly dividend for the first time in roughly 90 years **[S15]** |
| June 1974 | REAL | The utility's filings project **negative reserve margins** for August and September **[S15]** |

### The game
| In-game date | Day | Act | R/I | Event |
|---|---|---|---|---|
| 21 Jun | Fri | 1 | INV | **Opening:** dusk at the Flatiron; Mayhew's offer on the walk up Broadway |
| 22–24 Jun | Sat–Mon | 1 | INV | The Corwin is sold to "Corwin Residential Associates"; Lisle is counsel |
| 25–28 Jun | Tue–Fri | 1 | INV | Teddy's side jobs: cab fares, a garment delivery, a photo job |
| 29 Jun | Sat | 1 | INV | First vacate notices slid under Corwin doors |
| 1 Jul | Mon | 1 | INV | Teddy takes Mayhew's job |
| 4 Jul | Thu | 1 | INV | **Act 1 ends.** First collection run through an empty holiday district. Fireworks on the rivers are heard, not seen. |
| 5–12 Jul | | 2 | INV | Collection runs (flowers, fur, garment, arcades); Teddy maps the surcharge |
| 15 Jul | Mon | 2 | INV | Calloway approaches Teddy at the Herald Square department store's lunch counter. **Branch A.** |
| 19–20 Jul | Fri–Sat | 2 | INV | First brownout night: voltage dips in the Fur District; vault compressors stop |
| 22–26 Jul | | 2 | INV | Marisol's arc; the 8th Ave "tax" run goes wrong |
| 29 Jul | Mon | 2 | INV | The Corwin's power is cut for "rewiring"; Mr. Hollis is found dead on the 11th floor (pending sign-off) |
| 2–6 Aug | | 2 | INV | Teddy steals the surcharge ledger (or copies it for Calloway) |
| 7 Aug | Wed | 2 | INV | **Act 2 ends.** Mayhew learns about the wire, or about the copy. |
| 8 Aug | Thu | 3 | REAL | The President's resignation address (evening); every radio in the district carries it **[S16]** |
| 9 Aug | Fri | 3 | REAL | The resignation takes effect **[S16]** |
| 9–16 Aug | | 3 | INV | The syndicate starts to eat itself; Lomax flips; Wurtz cleans house |
| 19–23 Aug | | 3 | INV | Tenants' committee and garment operators march from the Corwin to Herald Square |
| 26–30 Aug | | 3 | INV | **Branch B:** who gets the ledger |
| 2 Sep | Mon | 3 | INV | **Labor Day finale:** a night run ending at the Flatiron |
| 1 Oct 1974 | Tue | Epi | REAL | Background: the city's plan to close a budget gap of roughly $1.5 billion is in the news **[S3]** |
| 1 Oct 1974 | Tue | Epi | INV | Free-roam epilogue; the world reflects the ending |

### Foreshadowing only (real 1975 events that must **not** appear as 1974 events)
- The city runs out of cash in spring 1975 **[S3]**.
- Mass police layoffs and the police unions' "welcome to Fear City" pamphlet are
  1975 **[S18]**.
- The sanitation strike is 1975 **[S18]**.

In 1974 our characters can only sense these coming. The epilogue's newspaper can hint.
