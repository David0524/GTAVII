# Third-party assets and licences

Every third-party file shipped with the game, per docs/briefs/FREE_ASSETS.md. Each stream adds its own
section. Allowed licences: CC0, public domain, MIT, BSD, Apache-2.0, zlib, OFL, and CC-BY 4.0 (with credit).

## Vehicles

All the vehicle textures come from **ambientCG**. The licence was checked on 2026-11-27 at
https://docs.ambientcg.com/license/, which says: "All ambientCG assets are provided under the Creative
Commons CC0 1.0 Universal License… You can include the raw files in your project, for example a video
game."

Each file was converted to greyscale, resized to 512² and re-encoded as JPEG (q88).

| File (public/vehicles/tex/) | Source asset | Source map | Licence | Used for |
| --- | --- | --- | --- | --- |
| rubber_h.jpg | [Rubber004](https://ambientcg.com/view?id=Rubber004) | Displacement (1K-JPG) | CC0 1.0 | tyre micro-texture (bump) |
| rubber_r.jpg | Rubber004 | Roughness | CC0 1.0 | tyre roughness |
| leather_h.jpg | [Leather026](https://ambientcg.com/view?id=Leather026) | Displacement | CC0 1.0 | vinyl roof and seat grain (bump) |
| leather_r.jpg | Leather026 | Roughness | CC0 1.0 | vinyl and seat roughness |
| metal_r.jpg | [Metal009](https://ambientcg.com/view?id=Metal009) | Roughness | CC0 1.0 | chrome wear in the roughness |
| grime.jpg | [SurfaceImperfections003](https://ambientcg.com/view?id=SurfaceImperfections003) | Color | CC0 1.0 | dirt and rain-streak mask on paint and glass |

Optional credit (CC0 needs none): "Created using Rubber004, Leather026, Metal009 and
SurfaceImperfections003 from ambientCG.com, licensed under CC0 1.0 Universal."

Period photographs in `references/` are reference only (shape and colour) and are not shipped.
