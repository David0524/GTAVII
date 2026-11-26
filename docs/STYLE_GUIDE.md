# Style guide: "Tenderloin '74" (first cut)

**Source of truth for look and feel across all workstreams** (rendering, facades, vehicles,
pedestrians, UI). The guide is grounded in real photographs of these streets from 1973–74: the
public-domain DOCUMERICA series in `references/` (catalog with credits in
`references/catalog.json`). An image cited as `[549869]` is `references/img/documerica_549869.jpg`.

Status: first cut, written ahead of the Library of Congress retry and a night-reference pass.
Sections marked **(verify)** are not yet backed by a reference photo.

---

## 1. The film look
The target is a 1970s New York street picture on 35mm colour reversal or negative stock, as
remembered, **not** a modern teal-and-orange grade.

**Measured from 87 district photos** (`tools/refs`; numbers are sRGB):

| Quantity | Value | Meaning for the grade |
|---|---|---|
| Shadow average (luma < 45) | `#2e171d` | Shadows are warm maroon-brown, never neutral or blue black |
| Midtone average | `#794d44` | Brown-rose mids |
| Highlight average (luma > 150) | `#d1b59e` | Highlights roll off to warm cream; pure white is rare |
| Luma p2 / p50 / p98 | 14 / 62 / 215 | Deep blacks, **low-key midtones**, highlights compressed below clip |
| Saturation median / p90 | 0.45 / 0.62 | Moderate overall; colour lives in a few strong accents |
| Saturated hues | 71% red–orange (0–30°), 14% orange–yellow, 15% magenta-red; blue and green ≈ 0 | Saturated blues and greens are almost absent |

**Correction:** part of the magenta-brown cast is dye fade in 50-year-old Ektachrome. The
grade should take **about 60% of that shift**: warm and slightly rose shadows, but skies that
are still readably blue at dusk, and greens in Madison Square Park that are olive, not
magenta.

**Grade recipe** (implemented in Phase 3 with TSL, every part toggleable per quality preset):
1. **Filmic tonemap** with a long shoulder (highlights compress to cream) and a slightly lifted
   but warm toe (black point around `#140a0c`).
2. **Split-tone:** shadows toward `#2e171d`, highlights toward `#e6d2b8`.
3. **Hue-selective saturation:** reds, oranges and yellows at 1.0–1.1; greens at 0.6 shifted
   toward olive; blues at 0.55 shifted toward teal-grey; skin protected.
4. **Halation:** red-orange bloom bleeding from bright edges (neon, headlights, sky behind
   buildings), radius about 0.4% of frame height, tinted `#ff5a2a`.
5. **Grain:** luminance-weighted, strongest in mids, about 0.04 RMS at 1080p. It never sits on
   UI text.
6. **Gate weave and vignette:** almost none. Vignette ≤ 12% at the corners. No fake scratches
   during gameplay; save artefacts for the title and loading screens.
7. **Haze:** midtown canyons fade to warm grey-pink with distance `[553845, 549874]`. The sky
   in a street slot is a bright, low-contrast strip, often bleached `[549867, 554331]`.

---

## 2. Palette (tokens)
These are sampled or eyeballed from the references and used by facades, vehicles, wardrobe
and UI. Code mirror (Phase 3): `src/style/palette1974.ts`.

| Token | Hex | Where it comes from |
|---|---|---|
| `soot.shadow` | `#2e171d` | Measured shadow average |
| `brick.tenement` | `#7a3b2c` | Red-brown walk-ups `[549849, 553893]` |
| `brick.buff` | `#b59a7a` | Garment-loft buff brick `[549882]` |
| `limestone` | `#c9b89a` | Prewar office bases |
| `castiron.paint` | `#6f6a5e` | Grey-painted iron fronts |
| `asphalt.dry` | `#3a2f2c` | Warm, patched; never blue-grey `[554331]` |
| `asphalt.wet` | `#1d1715` | Plus reflections |
| `taxi.yellow` | `#e3a92a` | Slightly orange, not lemon `[549869, 554330]` |
| `truck.red` | `#b2302a` | Box trucks and cabs `[549866, 549848]` |
| `marquee.cream` | `#efe3c4` | Backlit changeable-letter panels `[554297]` |
| `neon.red` | `#ff3b2f` | **(verify)** night pass |
| `neon.pink` | `#ff6fa8` | **(verify)** night pass |
| `sodium` | `#ff9a3c` | Avenue streetlights, about 2000 K **(verify)** |
| `mercury` | `#bfe6d8` | Older side-street fixtures, about 4000 K blue-green **(verify)** |
| `car.brown` | `#5a3326` | `[549851]` |
| `car.maroon` | `#4a1f22` | `[549882]` |
| `car.cream` | `#d8cdb4` | `[549863]` |
| `car.avocado` | `#6b6b3a` | Period paint chip **(verify)** |
| `car.harvestgold` | `#c79a3c` | Period paint chip **(verify)** |
| `car.white` | `#d9d4c8` | Ageing white `[554297]` |
| `cloth.camel` | `#a07a52` | Trench coats `[549855]` |
| `cloth.rust` | `#8e4a2e` | `[553822]` |
| `cloth.plaid` | `#7a5a3a` / `#a44030` | Mixed check `[548268]` |
| `cloth.denim70` | `#3c4a63` | Faded, dark |

---

## 3. City materials, wear and grime
- **Soot is the master layer.** Streaks run down from cornices, window heads and
  fire-escape landings. Ledges are dark on top. The ground floor is darker than the upper
  floors `[549849, 549864]`.
- **Brick:** red-brown tenements and buff lofts. Mortar is darker than modern, and patch
  repairs don't match.
- **Window rhythm:** shades pulled to different heights, some panes broken or boarded, AC
  units in roughly one window in six, wooden sash painted dark green, brown or cream
  `[549864, 553893]`.
- **Street level:** steel roll-down gates (graffiti on the closed ones), plate glass with
  gold-leaf or painted lettering, aluminium storefronts on 1950s–60s remodels.
- **Streets:**
  - patched asphalt over older paving, faded lane paint, manholes with steam
    `[553845: the steam plume]`
  - litter along the curb, newspapers blowing, garbage bags piled at the curb
    `[554310: the curbside litter]`
- **Construction:** sidewalk sheds and scaffolding are common `[554297: the scaffold at left]`.
- **Nothing pristine:** paint is chalky, chrome slightly pitted and glass hazy.

## 4. Storefronts and signage (invented names only)
These are observed in the references; use the **forms**, not the real names.
- **Theatre marquees:** black changeable letters on backlit cream panels, edged with chasing
  bulbs, stacked two or three deep along 42nd Street `[554297, 549872]`.
- **Neon script** over shopfronts (cursive, often red), and **projecting blade signs** at an
  angle to the street `[554293, 549869]`.
- **Painted wall signs and billboards:** big sans or slab lettering in red, black and cream,
  plus fading ghost signs on side walls `[554297: the "movie center" billboard]`.
- **Hand-lettered trucks:** company names in script or bold slab on box trucks, with phone
  numbers in exchange format (e.g. `LO 4-1500`) `[549866, 549848, 549855]`.
- **Small shops:** awnings, sidewalk displays (flowers, produce, racks) spilling onto the
  sidewalk `[551779]`.
- **Typography to draw from** (use OFL lookalikes, not the originals): bold condensed grotesk
  and Helvetica-style (transit and commerce), Cooper-ish soft serifs (diners, salons), brush
  script (neon), slab serif (hardware and trades), engraved serif with gold leaf (banks,
  jewellers).
- **Register:** every business name in game comes from the narrative team's
  BUSINESS_NAMES.md. Never a real one.

## 5. Street furniture **(partly verify)**
- **Streetlights:** a mix of tall mast-arm "cobra-head" fixtures on the avenues and older
  ornate posts. Colours as in §2.
- **Signals:** pole-mounted traffic signals plus WALK / DON'T WALK text signals; no countdown
  timers.
- **Booths and kiosks:** stainless or aluminium telephone booths and stands `[548257]`,
  newsstands, wire-mesh litter baskets, fire hydrants, mailboxes.
- **Subway:** entrance stairs with globe lamps, and gratings that leak rumble and light.
- **Steam:** orange-and-white striped steam stacks over manholes during work.
- **Street-name signs: (verify)** the colour scheme in 1974 Manhattan needs a reference before
  facades use it.

## 6. Vehicles
For the vehicles workstream, together with `docs/briefs/VEHICLES_BRIEF.md` (originality rule).
- **Mix:** long full-size sedans and hardtops dominate, followed by yellow cabs, box trucks
  and step vans `[549851, 549882, 554310]`.
- **Body details:** quad headlamps, full-width chrome bumpers, vinyl roofs, long hoods and
  decks, whitewall or narrow-band tyres, hubcaps `[549882, 549851]`. Even a white car reads
  ivory.
- **Taxis:** **mostly ordinary full-size sedans painted yellow**, with a roof light box and
  fare decals on the rear doors. Some fleets used a checker band; ours don't (see the
  originality rule) `[554330, 554331, 549876]`. Door decals carry the 1973 rate format:
  "60¢ first 1/5 mile · 10¢ each additional 1/5 mile" `[549869]`.
- **Trucks:** red, white and silver boxes with hand-lettered names, front cabs with big
  bumpers, often parked half on the curb `[549866]`.
- **Police:** a scooter with a white helmet appears `[554293]`; cars **(verify)**.
- **Condition:** dirty lower panels, dents in most cabs, mismatched replacement panels on
  older cars.

## 7. People and wardrobe
For pedestrian archetypes (sim) and wardrobe briefs (narrative).
- **Most of these references are cool-season photos.** Summer 1974 needs its own pass
  **(verify)**: short-sleeve patterned polyester shirts, tank tops, cotton dresses, light
  slacks, sandals.
- **Shapes:** wide collars and lapels, flared trousers, high waists, knee-length coats, big
  eyeglass frames, newsboy and knit caps `[553822, 549855, 548268, 549863]`.
- **Materials:** trench and camel coats, shearling and fur jackets, plaid sport coats, knit
  tops `[549863, 548268]`.
- **Hair:** long straight hair, afros, sideburns, moustaches, set and teased styles on older
  women `[548268]`.
- **Workers:** garment workers in shirt sleeves pushing racks and handcarts down the roadway
  `[549867, 549850]`. Delivery men, porters, doormen.
- **Palette:** camel, rust, brown, cream and plaid, with the occasional saturated red or
  orange piece. Denim is dark and faded.

## 8. Night, neon and rain **(verify: night reference pass pending)**
- Avenues are sodium orange; some side streets are mercury blue-green. The mix of the two is
  the signature look.
- Neon and marquee bulbs bloom into haze (halation, §1), and wet asphalt mirrors them in long
  vertical streaks.
- Windows at night are mostly warm incandescent; some flicker blue from TVs; offices are cool
  fluorescent.
- Rain greys the scene to low contrast. Brake lights and taxi roof lights carry the colour.

## 9. UI direction
- **Feel:** a 1970s film poster, newspaper and transit-signage feel, executed with
  modern-flagship polish.
- **Fonts:** Fraunces (display), League Gothic (heads), Archivo (UI) and Courier Prime (briefs).
  See `public/fonts/LICENSES.md`.
- **UI colours** come from §2: `marquee.cream` text, `taxi.yellow` accent, `truck.red` alerts,
  `soot.shadow` panels.
- **Prompts:** generic glyphs following the active device (`docs/CONTROLS.md`).

## 10. Anachronism checklist (never ship these)
- LED lighting.
- Modern plastic backlit chain signs and any real brand.
- Bike lanes, the Citi Bike style of bike share, pedestrian plazas on Broadway.
- Countdown pedestrian signals.
- Glass towers built after 1974 (see docs/PERIOD_AUDIT.md).
- Smartphones and flat-screen TVs, airbag-era car shapes.
- Neighbourhood names that came later ("NoMad", "Koreatown", "Flatiron District").
