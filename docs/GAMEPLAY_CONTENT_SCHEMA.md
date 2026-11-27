# Gameplay content schema (what gameplay reads from narrative content)

Gameplay owns the shapes; narrative owns the content. The code types are in
`src/gameplay/data/schema.ts`, validated by `validateContent()` (it fails loudly, listing every
problem). The placeholders that run until narrative's files merge are in
`src/gameplay/data/defaults.ts`.

## Units and conventions
- **Money:** integer **cents** inside gameplay. Narrative files may write dollars (`"price": 1.75`);
  the loader converts with `Math.round(x * 100)`.
- **Ids:** `item.*`, `weapon.*`, `shop.*`, `outfit.*`, `precinct.*` (narrative's), `char.*`.
- **Ammo:** an ammo item's quantity counts rounds. A shop sale of one "box" grants `rounds`.

## Files
| File | Shape | Notes |
|---|---|---|
| `content/items/*.json` | `ItemDef` | `kind`: weapon, ammo, consumable, key, evidence, photo, armor, clothing, misc. `illicit` (Sullivan Act handguns, ammo, plates) is confiscated on arrest. Evidence and keys are never sellable. |
| `content/items/weapons.json` | `WeaponDef` plus tier | Invented maker × model × tier (street, service, quality). Gameplay maps tiers to `items/guns.ts TIERS`. Names go in `docs/WEAPON_REGISTRY.md`. |
| `content/shops.json` | `ShopDef` | `markup ≥ 1`, `0 ≤ buyback < 1` (validated, so a buy-then-sell loop can never profit), `hours`, `requiresFlag` (fences). |
| `content/outfits/*.json` | `OutfitDef` | `pieces: [{garment, colour}]`, where colour is the word a witness would use ("tan", "powder blue"). `wardrobeSet` is passed to `Character.setWardrobe`. |
| `content/police/precincts.json` | `PrecinctDef` | Corruptibility 0–5 (normalised ÷5); `payoffs[].if` flags move it. Still needed: an area polygon or street bounds per house. |
| `content/cast/leads.json` + ENGINE_REQUESTS narrative 11 | `LeadProfile` | `maxHp`, aim per family, melee, sprint, evasion (memorability), crowdCover (blend), skills 0–100, abilities. |
| `content/barks/police_radio.json` | templates | `{description}` is filled from `describeText()`, e.g. "…male, thirties, medium build, tan leisure suit, green sedan, plate starting 4K…". |

## Price sheet (placeholders; 1974 New York, sourced or estimated)
| Thing | Price | Basis |
|---|---|---|
| Payphone call | 10¢ | The NYC payphone rate in 1974 (it rose to 25¢ only in the 1980s) |
| Coffee | 25¢ | Narrative's sheet says 20¢ to go; counter coffee 25¢ |
| Blue-plate special | $1.85 | Narrative has $1.75; theirs wins on merge |
| Evening paper | 20¢ | NYC dailies were 15–20¢ |
| Street map | 75¢ | |
| .38 rounds, box of 50 | $6.50 (fence 1.35×) | A sporting-goods price circa $6; the fence charges a premium |
| Snub revolver (fence) | $75 | Street-gun prices from period reporting, $50–$100 |
| Service revolver (fence) | $110 | |
| Hospital bill | $85 + injuries, capped at $250 | CORE_SYSTEMS: "a capped bill" |
| Lawyer (precinct call) | $75 + the fine | |
| Fine/bail | $25 × heat × (1 + 0.25 × priors) | |
| Expected bribe | $10 × heat² | $10 for a scuffle, $90 for shots fired, $250 at the top; officer-down can't be bought |
