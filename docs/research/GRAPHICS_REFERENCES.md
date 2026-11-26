# Research: how good-looking browser 3D (including Claude-built work) gets its look

Oversight summary of a cited research pass (sources linked).
- **Claude-built examples:**
  - [Tidewater](https://github.com/dgreenheck/tidewater): raw WebGPU, FFT ocean, physically based
    atmosphere, volumetric clouds, cascaded shadows, GTAO, temporal upscaling, auto-exposure. Props
    are **Poly Haven CC0 scans**, characters are **Microsoft Rocketbox** models, and vegetation uses
    impostors and dithered LOD.
  - [Wild Fields 1648](https://github.com/0xInsiderhq/wild-fields-1648): 20 Poly Haven models and 12
    PBR textures, cut from 112 MB to about 9 MB with meshopt and gltf-transform.
  - [Forest environment](https://discourse.threejs.org/t/forest-environment-built-with-three-js-and-webgpu/96126):
    three.js WebGPU; the grade, bloom, grain and faked light shafts carry the look; about 40–50 fps on
    an iPhone 16 Pro (the author's claim).
  - **The lesson:** the best ones pair Claude-written code with real scanned or authored assets.
    None reaches "real" from code-generated materials alone. Expect generated spatial layout to need
    review by eye.
- **Ranked for a procedural 1974 city on iPhone:**
  1. film grade (done);
  2. triplanar photoscan detail blended by a wear mask (ART_ASSETS);
  3. **AO baked per building at generation time**;
  4. HDRI and PMREM;
  5. **[LightProbeGrid](https://threejs.org/docs/pages/LightProbeGrid.html) per block or chunk** (check
     the WebGL fallback);
  6. instanced decals for grime and posters;
  7. instancing, LOD, impostors, KTX2 and meshopt;
  8. faked light shafts and aerial fog;
  9. desktop-only extras: GTAO ([example](https://threejs.org/examples/webgpu_postprocessing_ao)),
     SSR on wet roads, TRAA.
- **Not a fit:** Gaussian splats (there's no 1974 to scan, and they relight poorly); SSGI and real
  volumetrics on phones.
