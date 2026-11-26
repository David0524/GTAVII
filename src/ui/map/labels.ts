/**
 * Map label placement: greedy placement by priority with collision avoidance, the way a
 * cartographer sets type. Higher-priority labels go first; each tries a list of candidate
 * positions (around a point, or along a street) and takes the first one that doesn't overlap
 * placed labels or reserved symbols. Point labels that end up displaced get a hairline leader.
 * Rotated labels are tested with their rotated corners' bounding box (conservative).
 */
type G = CanvasRenderingContext2D;
export type Box = [number, number, number, number];

export class LabelPlacer {
  private boxes: Box[] = [];
  constructor(private W: number, private H: number, private pad = 2) {}
  reserve(b: Box) { this.boxes.push(b); }
  free(b: Box) {
    // fully on the canvas: a label that would be cut by the screen edge is not placed at all
    if (b[0] < 2 || b[1] < 2 || b[2] > this.W - 2 || b[3] > this.H - 2) return false;
    const p = this.pad;
    for (const o of this.boxes) if (b[0] - p < o[2] && b[2] + p > o[0] && b[1] - p < o[3] && b[3] + p > o[1]) return false;
    return true;
  }

  /** A label for a point (x,y). Candidates are tried nearest first; returns whether it was placed. */
  point(g: G, text: string, x: number, y: number, o: { font: string; colour: string; symbol?: number; leader?: boolean; maxR?: number; within?: Box }) {
    g.font = o.font;
    const w = g.measureText(text).width, h = parseFloat(o.font.match(/(\d+(?:\.\d+)?)px/)?.[1] ?? '11'), s = (o.symbol ?? 6) / 2 + 3;
    const cands: [number, number][] = [[s, -h * 0.15], [-s - w, -h * 0.15], [-w / 2, -s - h * 0.3], [-w / 2, s + h * 0.85], [s, -s - h * 0.2], [s, s + h * 0.6], [-s - w, -s - h * 0.2], [-s - w, s + h * 0.6]];
    if (o.leader) for (const r of [26, 40, 56]) for (const a of [-0.6, 0.6, -2.5, 2.5, -1.57, 1.57]) cands.push([Math.cos(a) * r - (Math.cos(a) < 0 ? w : 0), Math.sin(a) * r]);
    for (const [dx, dy] of cands) {
      const b: Box = [x + dx, y + dy - h * 0.8, x + dx + w, y + dy + h * 0.25];
      if (o.within && (b[0] < o.within[0] || b[1] < o.within[1] || b[2] > o.within[2] || b[3] > o.within[3])) continue;
      if (!this.free(b)) continue;
      this.boxes.push(b);
      const far = Math.hypot(dx + (dx < 0 ? w : 0), dy) > s + h;
      if (far) { g.strokeStyle = 'rgba(46,23,29,.55)'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(x, y); g.lineTo(dx < 0 ? b[2] + 1 : b[0] - 1, (b[1] + b[3]) / 2); g.stroke(); }
      g.fillStyle = o.colour; g.textAlign = 'left'; g.fillText(text, x + dx, y + dy);
      return true;
    }
    return false;
  }

  /** A label set along a street polyline (screen points), tried at several positions along it. */
  line(g: G, text: string, pts: number[], o: { font: string; colour: string; offset?: number; spacing?: string }) {
    g.font = o.font;
    const w = g.measureText(text).width, h = parseFloat(o.font.match(/(\d+(?:\.\d+)?)px/)?.[1] ?? '11');
    for (const f of [0.5, 0.35, 0.65, 0.2, 0.8]) {
      const k = Math.max(0, Math.min(pts.length / 2 - 2, Math.floor((pts.length / 2 - 1) * f))) * 2;
      const ax = pts[k], ay = pts[k + 1], bx = pts[k + 2], by = pts[k + 3];
      if (bx === undefined) continue;
      let ang = Math.atan2(by - ay, bx - ax); if (ang > Math.PI / 2) ang -= Math.PI; if (ang < -Math.PI / 2) ang += Math.PI;
      const mx = (ax + bx) / 2, my = (ay + by) / 2, off = o.offset ?? 0;
      const c = Math.cos(ang), s = Math.sin(ang);
      const corners = [[-w / 2, -h - off], [w / 2, -h - off], [-w / 2, -off], [w / 2, -off]].map(([u, v]) => [mx + u * c - v * s, my + u * s + v * c]);
      const b: Box = [Math.min(...corners.map((p) => p[0])), Math.min(...corners.map((p) => p[1])), Math.max(...corners.map((p) => p[0])), Math.max(...corners.map((p) => p[1]))];
      if (!this.free(b)) continue;
      this.boxes.push(b);
      g.save(); g.translate(mx, my); g.rotate(ang); g.fillStyle = o.colour; g.textAlign = 'center'; g.fillText(text, 0, -off - 1); g.restore();
      return true;
    }
    return false;
  }
}
