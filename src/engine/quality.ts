/** Quality presets. Phase 1 only uses the streaming/LOD/pixel-ratio knobs; later phases add
 *  shadows, SSR, AO, TAA, bloom, grade, grain, halation (all individually toggleable). */
export interface QualitySettings {
  name: 'low' | 'medium' | 'high' | 'ultra';
  pixelRatio: number;
  lod0Radius: number; // metres: full-detail chunks
  lod1Radius: number; // metres: building shells only
  propsRadius: number; // metres: water towers, bulkheads, awnings (skyline-scale props)
  detailRadius: number; // metres: AC units, fire escapes, balconies (~85% of prop triangles; tested per 100 m quadrant)
  maxWorkers: number;
  shadows: boolean;
  ssr: boolean; ao: boolean; taa: boolean; bloom: boolean; grade: boolean; grain: boolean; halation: boolean;
}
export const PRESETS: Record<QualitySettings['name'], QualitySettings> = {
  low: { name: 'low', pixelRatio: 0.75, lod0Radius: 350, lod1Radius: 1600, propsRadius: 180, detailRadius: 70, maxWorkers: 2, shadows: false, ssr: false, ao: false, taa: false, bloom: false, grade: true, grain: false, halation: false },
  medium: { name: 'medium', pixelRatio: 1, lod0Radius: 500, lod1Radius: 2400, propsRadius: 300, detailRadius: 140, maxWorkers: 2, shadows: true, ssr: false, ao: false, taa: true, bloom: true, grade: true, grain: true, halation: false },
  high: { name: 'high', pixelRatio: 1, lod0Radius: 700, lod1Radius: 3000, propsRadius: 450, detailRadius: 250, maxWorkers: 3, shadows: true, ssr: true, ao: true, taa: true, bloom: true, grade: true, grain: true, halation: true },
  ultra: { name: 'ultra', pixelRatio: 1.5, lod0Radius: 1000, lod1Radius: 3000, propsRadius: 700, detailRadius: 400, maxWorkers: 4, shadows: true, ssr: true, ao: true, taa: true, bloom: true, grade: true, grain: true, halation: true },
};
export function qualityFromUrl(): QualitySettings {
  const q = new URLSearchParams(location.search).get('quality') as QualitySettings['name'] | null;
  // Phones/tablets default to 'low' (and never render above 1.5x DPR); desktops to 'high'.
  const mobile = matchMedia('(pointer: coarse)').matches;
  return { ...PRESETS[q && q in PRESETS ? q : mobile ? 'low' : 'high'] };
}
