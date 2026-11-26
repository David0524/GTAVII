# Design: day/night cycle, time-of-day missions, sleeping

The user: *"Include day/night cycle. Some missions may make sense to be day only or night only. So
time will change when you start the mission. You can sleep in your bed to turn night to day."*

## The clock
- A continuous world clock and calendar (narrative request N1: 21 Jun – 2 Sep 1974, plus 1 Oct).
  **A game day lasts about 48 real minutes** (1 game minute = 2 real seconds). The engine tunes this
  and exposes it as a setting.
- **The full day/night cycle is visible:** a real sun path for Manhattan in summer (with the true-north
  offset already in Atmosphere), dawn haze, the hard midday glare of a heatwave, golden hour down the
  crosstown streets, dusk, and night.
- **Night is a showcase:**
  - sodium-vapour streetlights (orange) beside older mercury lamps (blue-green);
  - neon on the Deuce and in bar windows; lit rooms behind windows (Interiors Tier C) switching
    on and off on schedules;
  - headlights and tail-lights, the glow from subway gratings, wet streets reflecting it all after
    rain;
  - brownouts switch whole areas off (narrative N2).
- **Everything reads the clock:** the sim's density and archetype schedules, shop and interior
  hours, jobs and activities, police staffing, the radio programming, ambience and the newspaper's
  weekly edition.
- **Lighting is Phase 3 work, not Phase 6.** Facades, materials and the window shader have to be
  judged at noon, at dusk and at night from the start, so the full cycle lands with the Phase 3
  rendering pipeline. Weather variety can stay in Phase 6.

## Missions with a time window
- Missions declare `requires.timeWindow` (it exists in the mission contract) and optional
  `requires.dateRange`.
- **Starting a mission outside its window:** the player walks into the mission marker and is offered
  **"Wait until 9:00 PM?"** (or the window's start). Accepting plays a **time-lapse transition**: the
  camera rises, the sun arcs, shadows sweep, the streetlights and neon come on in waves. It lasts
  about 3–5 seconds, with the film grain and gate weave of the reel-change language, and can be
  skipped. Then the mission begins at the right hour. Declining leaves you in free roam.
- Missions without a window start at the current time.
- **The story clock policy** (narrative request N10, for the engine to confirm): story missions pinned
  to a date **hold** the calendar (the date cannot advance past an unplayed pinned mission; sleeping
  stops at that date), or the game **jumps** the player to it when they choose. A story beat can
  never be missed.

## Sleeping and waiting
- **Sleep in your own bed** (each lead's home, and owned safehouses): choose **"Sleep until morning
  (7 AM)", "until evening (7 PM)", or a chosen hour** in hourly steps. It plays the same time-lapse
  from inside the room: the window light shifts, the radiator ticks, the lead's at-home sleep
  animation plays.
- **Sleeping also:** saves the game (an autosave slot), clears the injury carry-over and restores
  stamina, and advances the world. Business income accrues, police reports decay, rent comes due,
  **alternate-side parking tickets can arrive for a car left on the street**, fences restock and
  jobs refresh. Sleeping is a meaningful choice, not just a skip.
- **Waiting without a bed:** sit at a diner counter, on a park bench, or in a hotel lobby to wait an
  hour or two (shorter skips, no save, no healing), and pay for a room at an SRO for a full sleep away
  from home.
- **The heat:** sleeping without an air conditioner in the July heatwave gives a poorer rest (less
  stamina restored). That's the home-upgrade hook from HOMES_AND_CARS.
- **You can't sleep** during a mission, while police are searching nearby, or with an active
  pursuit.

## Who does what
- **Engine:** the clock and calendar service, the full sun, sky and lighting cycle in Phase 3, the
  time-lapse transition (shared with the reel-change), the N10 hold/jump policy, mission-window
  gating in the mission runtime, and lighting groups for streetlights, neon and windows switched by
  the clock and brownouts.
- **Gameplay:** sleep and wait actions with their world effects (income, decay, rent, tickets,
  restocks), rest quality (heat and air conditioning), the "can't sleep now" rules.
- **UI:** the "Wait until…?" prompt at mission markers, the sleep menu (morning, evening or a
  chosen hour), the clock and date in the HUD (already in), time windows shown on mission info cards.
- **Interiors:** beds and wait spots as markers (lead homes, SRO rooms, diner counters, lobbies,
  benches); window light inside rooms following the sun.
- **Narrative:** check every mission's `timeWindow` (day-only and night-only choices that make sense
  for the story), N10, and lines for waking up, a bad night's sleep in the heat, and the SRO desk
  clerk renting a room.
- **Sim and audio:** already clock-driven; make sure the time-lapse advances them smoothly (no
  pop-in of the night crowd).
