# Design: homes that fit their characters, and owning cars

Written by the oversight session at the user's request: *"The characters should all have their own
home. Apartments should match the characters. Should be able to buy/own cars too."*

## 1. Homes

### Principle
**A home is a character portrait you can walk around in.** Every object says who lives there, what
they can afford, what they hide and what they're holding on to. The homes also change across the
summer as the story and the player change them.

### The three leads (narrative confirms; these are oversight suggestions to test against the bible)
Today the lead spawns are their **workplaces** (the Corwin, the Arden, the Varelas loft). Each lead
needs **a home that is theirs**, separate from work.
- **Teddy Arce:** an ex-cop who resigned under an internal proceeding and now clerks nights.
  - *Suggestion:* a **small rent-controlled walk-up** a few blocks from the Corwin, or a room
    upstairs at the Corwin itself if the bible wants him living where he works.
  - Either way: kept military-neat but going to seed; a folded uniform he never wears; a scanner
    radio; the keys board; a hot plate; mail he doesn't open.
- **Delphine Moore:** a former dress presser and keeper of the women's savings club.
  - *Suggestion:* a **Penn South** apartment (the garment workers' union co-op, W 23rd–29th,
    8th–9th Ave), a period-true and character-true home for a former union presser, inside the
    map.
  - Inside: modest and spotless; a sewing machine; the **savings club's hidden cash box** (a story
    object); her instant camera and pinned prints; a phone with a long cord.
  - Keep it **dignified and private**, separate from the Eighth Ave work world.
- **Nick Varelas:** rich on paper, short of cash.
  - *Suggestion:* a **prewar doorman apartment on the Madison Ave frontage** (Murray Hill edge,
    inside the bounds), grand and old-world: Greek and Kastorian touches, his wife's taste, a bar
    cart, a desk of unpaid bills hidden in a drawer, and the doorman as a recurring character.
  - The loft stays his workplace.

### What every lead home does (gameplay)
- **Save point** (manual save slots and sleep), **sleep or wait** (time skip; clears the injury
  carry-over), **wardrobe** (outfits stored here; change clothes to break a police description),
  **stash** (weapons, cash, items; protected from death and arrest), a **gun-cleaning** bench, a
  **phone** with messages (Teddy's answering service at the Corwin desk becomes a home phone
  where it fits), a **TV and radio**, and food (heals).
- **It reflects the story:** dressing changes by act (Nick's furniture repossessed in Act 3 if the
  story goes that way; Delphine's prints wall grows; Teddy's place gets neater or worse with his
  choices) and with **player purchases** (furniture, a better lock, an air conditioner in the
  heatwave, a safe). Upgrades are period-only and visible.
- **Other leads can visit:** the bail-out and lending scenes can play there.
- **Discovery:** each home is on the map from the start for its own lead; the others learn it
  through the story.

### Other characters' homes
- **Principals** whose story puts you in their home (Carmen at Penn South, Augie, the Corwin
  tenants on the 11th floor, and others) get **hero interiors that match them**, with the same
  "portrait" rule.
- **Buyable extra places** (ECONOMY property): a hideout room, a garage apartment, a loft. These
  are safehouses with fewer features, dressed by the player's upgrades.

## 2. Owning cars

### Ways to get a car
- **Used-car lot:** an invented lot within the bounds (period: pennants, a trailer office, a salesman
  with patter). Stock rotates weekly; price depends on class, trim, condition and haggling.
- **Newspaper classifieds:** private sellers in the weekly paper ("'69 4-dr, runs good, $650 or best
  offer"). You phone from a payphone, meet them at the curb, test-drive, haggle. Some are lemons
  and some are bargains (condition hidden until inspected; Teddy or a mechanic can inspect).
- **New-car showroom:** a period dealership with invented makes. Expensive, a long-term goal,
  Nick's world.
- **Win one** in a card game or a bet; **receive one** through the story.
- **"Paper" a stolen car:** a chop shop can wash the title and plates for a fee. It then becomes
  legally yours, but a sharp cop or the original owner may still recognise it.

### Owning and keeping cars
- **Title and plates** per owned car. Owned cars persist completely: model, variant, trim,
  condition, damage, upgrades, **trunk contents**, fuel if fuel is used (period gas stations
  inside the map), mileage.
- **Where they live:**
  - **Street parking**, with **alternate-side parking rules** (period-true NYC). Park on the
    wrong side at the wrong time and you get **a ticket**; leave it too long and it's **towed
    to the pound**.
  - **Monthly spaces in Manhattan parking garages** (rent, safe, cars kept clean).
  - **Your own garage** (ECONOMY property), with more slots and cheap repairs.
- **The tow pound:** pay the fees to retrieve the car. Unpaid tickets pile up; let them pile too
  high and the car is booted.
- **Theft and loss:** owned cars can be stolen in the world (rarely, more in some blocks without a
  garage); an optional **insurance** policy (an invented insurer, a monthly premium) replaces a
  destroyed or stolen car at its insured value, which stops the frustration of losing a favourite.
- **Selling and trading:** sell back to the lot, sell privately through the classifieds, or trade
  in.
- **Each lead's personal car** (Nick's big sedan, and so on) starts owned. Leads can lend cars to
  each other.
- **Customisation:** period-only (ECONOMY and CORE_SYSTEMS §6): tyres, suspension, carburettor, a
  police-package engine, a **respray at a body shop** (it changes the colour, but the plates and
  the reported description remain, so it's not an instant escape), and plates.

## Who does what
- **Narrative:** confirm or revise the three lead homes against the bible, a dressing brief per
  home (the "portrait" lists, the changes per act), principals' homes, the used-car lot and
  salesman, classifieds content, the showroom, the doorman and the insurer.
- **Interiors:** the lead homes and principals' homes as hero interiors with home markers (save,
  sleep, wardrobe, stash, cleaning bench, phone, TV), dressing states per act and per upgrade;
  parking garages; the used-car lot office and the showroom; the tow pound office (if inside
  bounds; otherwise a reel-cut).
- **Gameplay:** purchase, haggling, classifieds meetings, inspections, titles, alternate-side
  rules, tickets, towing, the boot, insurance, selling, lending, home upgrades and their effects.
- **Vehicles:** full per-instance persistence (variant, trim, condition, damage, upgrades, trunk,
  plates, paint) and fuel if adopted.
- **Sim:** alternate-side street-cleaning schedules, parking enforcement agents, tow trucks that
  actually tow player cars, the sanitation sweeper.
- **Engine:** save sections for owned cars and homes; owned cars are persisted and streamed back
  where you left them.
- **UI:** the lot and showroom screens, the classifieds page in the newspaper, the "my cars" list
  with locations on the map, ticket and pound notices, home upgrade menus.
- **Characters:** at-home idles (sleeping, cooking at a hot plate, watching TV, changing clothes).
