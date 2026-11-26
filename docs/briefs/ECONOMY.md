# Design: free-roam money, earning outside missions

**Owner:** Gameplay (systems and balance). **Content:** Narrative (names, prices, rosters, news).
**Hooks:** Interiors (registers, safes, burglary targets), Sim (witnesses, marks, traffic), Engine
(UI, newspaper, save). Written by the oversight session at the user's request: *"Make sure there's a
way for players to make money aside from missions."*

## Principles
- **Every lead can earn in free roam from the first hour,** legally and illegally. Missions pay
  best per hour, and free roam pays well enough to fund clothes, guns, cars, bribes and property.
- **The small map is the design: money is layered onto the same blocks.** The same diner is a
  breakfast spot, a register to rob, a payphone for jobs and a numbers drop.
- **Crime feeds the police system.** Every illegal earning is witnessable and reportable, and
  bribes and payoffs are a real cost of doing business. The game's theme is the price of the pad.
- **Originality:** use the genre's pillars (jobs, robbery, theft, gambling, property), not any
  game's specific mechanics. No copies of signature activities, UIs or named systems.
- **Use only 1974 money:** period prices, no cards, cash in your pocket (it can be lost when wasted
  or arrested), and banks and safes for savings.

## 1. Street jobs (legal, repeatable, skill-based)
Each job has a skill curve, a payout ladder and chains of regulars.
- **Hack cab** (Teddy or anyone with a hack licence). Fares hail you (the sim's `hail` event); the
  tip depends on route knowledge of the one-ways, speed and smoothness.
- **Freelance night photos** (Delphine). Listen to a police radio, race to scenes, shoot with the
  instant camera, and **sell prints to an invented tabloid's night desk**. The price comes from the
  subject, composition and how fast you get there.
- **Garment rush and deliveries.** Push racks and drive box trucks through the Garment District
  against the clock. Damage docks pay.
- **Locksmith and night security** (Teddy's keys). Call-outs to lockouts and alarms, sometimes a
  trap or a temptation, which turns into the burglary line.
- **Bail-bond skip tracing.** A bondsman's board of skips with a description, haunts and a reward.
  Bring them in on foot, by car or by talking them round.
- **Tow and repo.** Hook double-parked cars (the sim already double-parks), or repossess for a
  finance company. The owners fight back.

## 2. Crime (illegal, witnessed, profitable)
- **Robbing shops and registers.** Use the Interiors chat's register and back-office markers:
  intimidate the clerk; the safe takes time; witnesses run to call boxes. Your takings depend on
  the time of day and whether the shop was hit recently.
- **Burglary.** Enter apartments and offices through keys, fire escapes and roof hatches
  (Interiors), fence the loot (pawnshops pay less; fences pay more but want specific items).
  Residents come home on schedules.
- **Car theft for a chop shop.** A chop shop posts a **weekly wanted list** (class, era-colour,
  condition). Deliver within the damage limit for full pay; plates can also be swapped here (see
  police).
- **Truck hijacking.** Garment and fur trucks are a period-true racket. Intercept, take the cargo,
  sell to a fence. It ties into the story's trucking and fur-vault world.
- **Pickpocketing and short cons.** Pick pockets in Herald Square and Penn Station crowds. Work a
  card-game hustle or a pool hustle as either the hustler or the mark.
- **Collections and protection** (illegal and repeatable). Lean on debtors for a loan shark; each
  debtor reacts differently (pays, runs, fights, gets a cop to wait for you).

## 3. Gambling (risk money)
- **The daily number.** Bet with a numbers runner on 3-digit numbers drawn from the day's
  racetrack results, which are printed in the newspaper. Long odds, a big payout. Later you can run
  a book yourself (it ties into the police payoffs).
- **Off-track betting parlours** (legal in 1971+ NYC). Simulated horse races run in game time with
  form, odds and results in the paper.
- **Backroom card games** (a skill minigame plus reading tells; you can be cheated, or cheat) and
  **pool halls** (a physics minigame with money matches).
- **Fight cards at the Garden:** bet on bouts. Later, fix a bout as a story-adjacent side line.

## 4. Property and businesses (passive income with real 1974 trouble)
Nick's lane especially, but anyone can buy smaller businesses:
- **Buy a business** (a laundromat, a diner, a parking garage, an arcade on the Deuce, a pool hall,
  a newsstand) or **a building**. Each pays weekly income based on the block's foot traffic and
  how it's run, and it unlocks a side line (the garage stores cars, the arcade launders cash, the
  newsstand is a numbers drop).
- **Trouble is the game:** shakedowns from the precinct (pay the pad or face inspections),
  protection demands from crews, brownout losses, break-ins, a manager skimming. You respond
  yourself or hire muscle.
- **Upgrades** change the income and what's on offer, and are visible in the world (a new sign,
  neon, a fresh awning).

## 5. Found money
- **Random street encounters** with rewards: a lost wallet (return it or keep it), a runaway car,
  a mugging in progress, a dropped bank bag.
- **Story collectibles** with cash or unlock payoffs: stash spots in the stairwells and rooftops of
  enterable buildings.

## Money sinks (so earning matters)
Clothes and outfits (they break witness descriptions), weapons and ammo, cars and repairs, plates,
**bribes and precinct payoffs**, hospital bills, lawyers and bail, rent at each lead's home, property
purchases, upgrades and wages, gambling losses. Per-lead wallets plus **Nick can lend to the
others, with interest and a relationship effect.**

## Balance targets (gameplay to tune, measure in the headless sim)
- Hourly earnings: missions ≈ 1.0×; best crime ≈ 0.6–0.8× with real heat; best legal jobs
  ≈ 0.4–0.5× with no heat; property ≈ 0.2–0.4× passive after investment.
- No unbounded exploits: register takings, burglary loot, the chop list and fence demand all
  replenish on game-time schedules, and fences saturate.
- A headless economy simulation of a 20-hour playthrough should show a sensible money curve with
  no runaway wealth or soft-locks (always a legal way to earn back from zero).

## Where each part lives
- **Gameplay:** wallets, jobs runtime, robbery, burglary, theft, fences, the chop list, gambling
  minigames, property income and events, balance and the economy simulation.
- **Narrative:** job givers, regulars, the bondsman's skips, fences and their wants, businesses
  for sale, the tabloid, the bookie, betting race cards, newspaper results and prices, barks.
- **Interiors:** registers, safes, back offices, burglary targets, resident schedules, stash
  spots, business interiors that change with upgrades.
- **Sim:** fares, marks, witnesses, double-parked cars, foot-traffic numbers per block (feeding
  business income).
- **Engine:** money HUD, the weekly newspaper UI (results, the chop list, the number, prices),
  business management screens, save sections.
