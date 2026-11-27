/**
 * Skin lighting for character heads (and any material that sets `skinWeightNode`):
 *  - pre-integrated diffuse (Penner-style, analytic): per-channel wrapped N·L whose wrap grows with
 *    the surface curvature, so light bleeds red across the terminator on the nose, lips, ears and
 *    eyelids but not on the flat cheek; and per-channel normals (red mostly from the smooth
 *    geometric normal, blue from the detail normal), so pores and fine wrinkles soften in red the
 *    way scattered light softens them in life;
 *  - dual-lobe specular (two GGX lobes, 85/15, the second sharper): the broad sheen of skin
 *    plus the tight highlight of its oily film;
 *  - thin-region transmission (ears, nostrils), as MeshSSSNodeMaterial's model.
 * With skinWeightNode = 0 it reduces to the stock Lambert + GGX (eyes, teeth, cloth).
 */
import * as THREE from 'three/webgpu';
import {
  BRDF_GGX, BRDF_Lambert, F_Schlick, float, vec3, mix, normalView, normalViewGeometry, normalWorldGeometry, positionWorld,
  positionViewDirection, diffuseContribution, roughness, specularColor, specularColorBlended, specularF90, fwidth, length,
} from 'three/tsl';

type N = any;

class SkinLightingModel extends (THREE as any).PhysicalLightingModel {
  direct({ lightDirection, lightColor, reflectedLight }: { lightDirection: N; lightColor: N; reflectedLight: N }, builder: any) {
    const m = builder.material as SkinNodeMaterial;
    const sw: N = m.skinWeightNode ?? float(1);
    // curvature (1/m) from screen derivatives of the geometric normal and position; 0..1 over
    // a flat cheek (~10/m) to the nose tip and lips (~70/m)
    const curv = length(fwidth(normalWorldGeometry)).div(length(fwidth(positionWorld)).max(1e-5));
    const c01 = curv.sub(8).div(60).clamp(0, 1).mul(sw);
    const L = lightDirection;
    const nR = mix(normalView, normalViewGeometry, sw.mul(0.7)).normalize();
    const nG = mix(normalView, normalViewGeometry, sw.mul(0.3)).normalize();
    const ndl = vec3(nR.dot(L), nG.dot(L), normalView.dot(L));
    const wrap = c01.mul(vec3(0.32, 0.12, 0.05)).add(vec3(0.05, 0.018, 0.008).mul(sw));
    const pre = ndl.add(wrap).div(wrap.add(1)).clamp(0, 1);
    // keep the lit side's energy (wrapping lightens the whole surface slightly): at N·L = 1 it's 1
    const diffIrr: N = pre.mul(lightColor);
    const halfDir = L.add(positionViewDirection).normalize();
    const dotVH = positionViewDirection.dot(halfDir).clamp();
    const F: N = (F_Schlick as N)({ f0: specularColor, f90: specularF90, dotVH });
    reflectedLight.directDiffuse.addAssign(diffIrr.mul((BRDF_Lambert as N)({ diffuseColor: diffuseContribution })).mul(F.oneMinus()));
    const dotNL = normalView.dot(L).clamp();
    const s1: N = (BRDF_GGX as N)({ lightDirection: L, f0: specularColorBlended, f90: specularF90, roughness });
    const s2: N = (BRDF_GGX as N)({ lightDirection: L, f0: specularColorBlended, f90: specularF90, roughness: roughness.mul(0.62).max(0.1) });
    const spec = mix(s1, s1.mul(0.85).add(s2.mul(0.15)), sw);
    reflectedLight.directSpecular.addAssign(dotNL.mul(lightColor).mul(spec).mul((this as any).multiScatteringCompensation));
    // transmission through thin parts (ears, nostrils): light from behind, scaled by thickness colour
    if (m.thicknessColorNode) {
      const sh: N = L.add(normalView.mul(m.thicknessDistortionNode)).normalize();
      const sd: N = (float as N)((positionViewDirection as N).dot(sh.negate()).saturate().pow(m.thicknessPowerNode).mul(m.thicknessScaleNode));
      reflectedLight.directDiffuse.addAssign(vec3(sd.add(m.thicknessAmbientNode).mul(m.thicknessColorNode)).mul(m.thicknessAttenuationNode.mul(lightColor)));
    }
  }
}

export class SkinNodeMaterial extends THREE.MeshSSSNodeMaterial {
  /** 1 = skin (pre-integrated diffuse, dual-lobe specular), 0 = stock physical. */
  skinWeightNode: N = null;
  setupLightingModel(): any {
    const s = this as any;
    return new (SkinLightingModel as any)(s.useClearcoat, s.useSheen, s.useIridescence, s.useAnisotropy, s.useTransmission, s.useDispersion);
  }
}
