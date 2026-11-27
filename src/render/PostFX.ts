/**
 * Post stack: the 1974 film look (docs/STYLE_GUIDE.md §1, targets measured from 87 DOCUMERICA frames).
 *
 *   scene pass ─┬─ bloom (lamps, neon, lit windows)
 *               └─ halation (tight red-orange bleed around bright edges: emulsion back-scatter)
 *   → filmic tonemap + sRGB (renderOutput) → GRADE (display-referred):
 *       split-tone: shadows toward warm maroon #2e171d, highlights toward cream
 *       hue-selective saturation: reds/oranges/yellows keep, greens/blues drop (olive/teal-grey)
 *       warm lifted black, highlight roll-off below clip (nothing pure white)
 *   → vignette (≤12%) → grain (luminance-weighted, mids strongest) → FXAA
 * Every stage is toggled by the quality preset; all parameters are uniforms for tuning.
 * (TSL node graphs are typed loosely here: the three.js TSL typings are stricter than the runtime.)
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as THREE from 'three/webgpu';
import {
  pass, renderOutput, uniform, vec3, vec4, float, luminance, mix, smoothstep, clamp, screenUV, screenSize, hash,
  length, sub, vec2, Fn, max, min, abs,
} from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { fxaa } from 'three/addons/tsl/display/FXAANode.js';
import type { QualitySettings } from '../engine/quality';

export const postUniforms = {
  gradeAmount: uniform(1),
  shadowTint: uniform(new THREE.Color(1.1, 0.88, 0.9)),
  highlightTint: uniform(new THREE.Color(1.05, 0.95, 0.8)), // cream highlights (target #d1b59e; the noon sky read grey-blue)
  coolDesat: uniform(0.58), // saturation kept on greens/blues
  warmSat: uniform(1.06),
  blackLift: uniform(new THREE.Color(0.03, 0.015, 0.018)),
  vignette: uniform(0.12),
  grain: uniform(0.035),
  frame: uniform(0),
  bloomStrength: uniform(0.38),
  midTint: uniform(new THREE.Color(1.12, 0.95, 0.86)), // rose-brown mids (target #794d44)
  halation: uniform(0.55),
};

export class PostFX {
  readonly post: THREE.PostProcessing;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private bloomNode: any = null;

  constructor(renderer: THREE.WebGPURenderer, scene: THREE.Scene, camera: THREE.Camera, q: QualitySettings) {
    const P = postUniforms;
    this.post = new THREE.PostProcessing(renderer);
    const scenePass = pass(scene, camera);
    const color = scenePass.getTextureNode('output');
    let hdr: any = vec4(color);
    // Clamp what feeds bloom/halation: the sun disc is enormous in HDR and would otherwise flood the whole
    // frame when looking toward the sunset. Lamps, neon and windows (~1-4) still bloom fully.
    const glowIn = min(vec4(color), vec4(3.0, 3.0, 3.0, 1.0));
    if (q.bloom) { this.bloomNode = bloom(glowIn, 1, 0.45, 1.2); hdr = hdr.add(this.bloomNode.mul(P.bloomStrength)); } // threshold above sky by day; lowered at night
    if (q.halation) hdr = hdr.add(vec4(bloom(glowIn, 1, 0.08, 1.0).rgb.mul(vec3(1.0, 0.3, 0.1)).mul(P.halation), 0));

    const ldr = renderOutput(hdr); // renderer tone mapping (ACES filmic) + sRGB

    const grade = Fn(([c0]: any[]) => {
      let c: any = c0.rgb;
      const l = luminance(c);
      // split-tone
      const ws = float(1).sub(smoothstep(0.0, 0.42, l));
      const wh = smoothstep(0.5, 0.95, l);
      c = mix(c, c.mul((P.shadowTint as any)), ws);
      c = mix(c, c.mul((P.highlightTint as any)), wh);
      c = mix(c, c.mul(P.midTint as any), float(1).sub(ws).sub(wh).max(0)); // rose-brown mids (#794d44 family)
      // hue-selective saturation: warmth = red/yellow dominance over blue
      const warm = clamp(c.r.sub(c.b).mul(3.0).add(0.35), 0, 1);
      const sat = mix(P.coolDesat, P.warmSat, warm);
      c = mix(vec3(luminance(c)), c, sat);
      // warm lifted black + highlight roll-off (p98 target ~0.9: nothing clips to white)
      c = c.mul(float(1).sub((P.blackLift as any).x)).add(P.blackLift as any);
      c = mix(c, min(c, vec3(0.93, 0.9, 0.83)).add(max(c.sub(0.93), 0).mul(0.25)), smoothstep(0.82, 1.0, c));
      return vec4(mix(c0.rgb, c, P.gradeAmount), c0.a);
    });

    let out: any = q.grade ? grade(ldr) : vec4(ldr);
    // vignette
    const d = length(sub(screenUV, vec2(0.5))).mul(1.3);
    out = vec4(out.rgb.mul(float(1).sub(smoothstep(0.45, 1.0, d).mul(P.vignette))), out.a);
    // grain: luminance-weighted (strongest in mids), new pattern every frame
    if (q.grain) {
      const px = screenUV.mul(screenSize).floor();
      const n = hash(px.x.add(px.y.mul(1931.7)).add(P.frame.mul(7919.0))).sub(0.5); // both axes (a vec2 hash collapses to x -> stripes)
      const lm = luminance(out.rgb);
      const amp = P.grain.mul(float(1).sub(abs(lm.sub(0.45)).mul(1.6)).max(0.25));
      out = vec4(out.rgb.add(n.mul(amp)), out.a);
    }
    this.post.outputNode = q.taa || q.grade ? fxaa(out) : out;
    this.post.outputColorTransform = false;
  }

  /** Time-of-day look: night lowers the bloom threshold (lit windows and lamps get a little glow); blue hour
   *  relaxes the cool desaturation and the warm shadow tint so cool fill can sit against warm practicals. */
  setTimeOfDay(night: number, blueHour: number) {
    if (this.bloomNode?.threshold) this.bloomNode.threshold.value = 1.2 - 0.85 * night;
    const P = postUniforms, k = Math.max(blueHour, night * 0.4);
    P.coolDesat.value = 0.58 + 0.37 * k;
    (P.shadowTint.value as THREE.Color).setRGB(1.1 - 0.16 * k, 0.88 + 0.08 * k, 0.9 + 0.16 * k);
  }

  render() { postUniforms.frame.value = (postUniforms.frame.value + 1) % 4096; this.post.render(); }
}
