/**
 * Real car renders over the drawn profiles: `carArt` emits the drawing in a slot tagged with the model; `hydrateCarArt`
 * asks the host for the render (vehicles' renderThumbnail) and swaps it in when it arrives. Object URLs are cached per
 * model, paint, variant and angle for the session; a missing hook or a failed render leaves the drawing.
 */
import type { CarModelRef, UiHost } from '../../shared/uiHost';
import { esc } from '../util';

type Angle = 'side' | 'three-quarter';
const urls = new Map<string, Promise<string | null>>();
const key = (m: CarModelRef, a: Angle) => `${m.id}|${m.paint ?? 'p'}|${m.variant ?? 0}|${a}`;

export function carArt(drawn: string, model: CarModelRef | undefined, angle: Angle = 'side'): string {
  if (!model) return drawn;
  return `<span class="car-art" data-model="${esc(JSON.stringify(model))}" data-angle="${angle}">${drawn}</span>`;
}

export function hydrateCarArt(root: HTMLElement, host: UiHost) {
  if (!host.carThumb) return;
  root.querySelectorAll<HTMLElement>('.car-art[data-model]:not(.has-render)').forEach((slot) => {
    let m: CarModelRef; try { m = JSON.parse(slot.dataset.model!); } catch { return; }
    const a = (slot.dataset.angle as Angle) ?? 'side', k = key(m, a);
    let p = urls.get(k);
    if (!p) { p = host.carThumb!(m, a).then((b) => URL.createObjectURL(b), () => null); urls.set(k, p); }
    p.then((u) => {
      if (!u || !slot.isConnected) return;
      const img = new Image(); img.className = 'car-render'; img.alt = ''; img.decoding = 'async'; img.src = u;
      img.onload = () => { slot.replaceChildren(img); slot.classList.add('has-render'); };
    });
  });
}
