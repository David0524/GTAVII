# GAMEPLAY_PROGRESS: combat, damage, police, items, economy

Source of truth for the gameplay stream (branch `claude/gameplay-74`, brief `docs/briefs/GAMEPLAY_BRIEF.md`).
Read first each session, update last. (Work in progress: fuller write-up lands with the test scene.)

## Done
- Headless core in `src/gameplay/` (no three.js): health/injury/bleeding/regen, guns, batched ballistics
  with penetration, melee with parry/dodge/grapple, cover points, aim assist / touch lock-on, combat AI,
  witnesses → call boxes → precinct reports → response → bribes, inventory/money (cents), shops,
  wardrobe, payphones, breakable props, wasted/arrested outcomes, versioned save with migrations.
- Tests: `npx tsx --test src/gameplay/tests/*.test.ts`

## Next
- Save/shop/AI/perf tests, `?gameplay=1` scene, recorded frames, docs.
