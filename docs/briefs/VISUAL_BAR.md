# Visual bar (user decision, 2026-11-27)

> User: "I want this to be GTA level graphics. Ideally GTA VI but GTA V level at worst."

**Floor:** a 2014 current-gen open-world crime game look (the GTA V PS4 remaster class), on an
iPhone 17 Pro in the browser at a stable 30 fps, and better on desktop.
**Aim:** push toward GTA VI-era density and lighting wherever the phone budget allows. On desktop
WebGPU, go further (higher-quality GI, reflections and shadow resolution).

Reference games: **GTA V, GTA VI and RDR2** (user, 2026-11-27: "Continue to reference the GTA games and RDR2. Also reference 1970s NYC"). They are a **quality bar only**. Copy no assets, logos, UI, names or look-alike designs.
1974 photographs stay the reference for *what* things look like; the bar sets *how well* they're rendered.

Our advantage is the small map (story core, 132 chunks). Spend that budget on **density and detail
per block**, not on distance.

## What "GTA V level" means, concretely (every item is required)

### Lighting and post
- Physically based lighting with a time-of-day sky and sun; HDR, filmic tonemap, per-time-of-day grade.
- Cascaded shadow maps with soft filtering; contact shadows or SSAO/GTAO in every corner and under every car.
- Indirect light: baked or probe-based GI (irradiance probes per block, updated across time of day),
  so canyons aren't flat ambient.
- Reflections: SSR plus reflection probes; wet-street reflections after rain; correct glass and car-paint reflections.
- Volumetric light and fog at dawn, dusk and night; bloom on practicals; lens and grain kept subtle.
- Night: hundreds of local lights per view (clustered or forward+), emissive signage, headlights casting light.
- TAA (or a better equivalent) so nothing shimmers. Stable at phone resolution with adaptive DPR.

### World geometry and materials
- Every surface uses PBR photoscan or high-quality CC0 materials (albedo, normal, roughness, AO), with
  wear, grime, wetness and decals on top. No flat-coloured planes anywhere at street level.
- Facades: real depth. Window recesses, sills, lintels, cornices, fire escapes, storefront glass with
  parallax interiors, awnings, signage, AC units, pipes, scaffolding. Ground floors are detailed
  shopfronts, not textured walls.
- Streets: kerbs with height, crosswalk paint wear, manholes, patches, cracks, litter, puddles, steam vents.
- Street furniture and trees as in engine Phase 3 blocks A and B.
- Landmarks are hand-detailed hero models.

### Life
- Dense traffic and pedestrians, parked cars on every kerb, pigeons and rats, steam and litter
  that move. A street must never look empty in a screenshot.

### Characters and vehicles
- Characters: photoreal heads (pending the head-source decision), skin shading with subsurface,
  hair cards, cloth with normal detail, blinks, lip-sync and facial animation in cutscenes.
- Vehicles: detailed exteriors with real reflections, damage deformation, and interiors visible through
  glass. Lights cast light.

### Interiors
- Same material and lighting standard as outdoors. Light through windows. Worn-to-beautiful grades.

## How it's checked
- Every look milestone ships a **side-by-side board**: our shot, the 1974 reference photo for content,
  and a written comparison against the bar for rendering quality, with lookmetrics and phone frame time.
- Oversight rejects any shot with flat-shaded surfaces, empty streets, missing shadows or contact
  occlusion, or visible LOD pops, whatever the metrics say.
- Performance is non-negotiable: stable 30 fps on iPhone 17 Pro (Low Power Mode off) and 60 on desktop.
  Quality tiers scale down, never the content.

## Honest limits
- A browser on a phone can't match GTA VI's full path-traced-level lighting and density. Desktop
  WebGPU gets closer. If the user later wants full GTA VI parity, that means a native port (for example
  Unreal) by a dedicated team, using this game as the blueprint.
