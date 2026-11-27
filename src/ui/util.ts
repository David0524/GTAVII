/** Small shared UI helpers. */
export function esc(s: string) { return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!); }

/** 1974 money: "$43.15", "$2,310", "35¢". */
export function money(v: number, cents = true) {
  if (Math.abs(v) < 1 && v !== 0 && cents) return `${Math.round(Math.abs(v) * 100)}¢`;
  const s = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: cents && v % 1 ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
  return `${v < 0 ? '−' : ''}$${s}`;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Campaign minutes (since 1974-06-21 00:00) -> "Fri Jun 21, 8:41 PM". */
export function gameTime(min: number) {
  const d = new Date(Date.UTC(1974, 5, 21) + Math.floor(min) * 60000);
  const h = d.getUTCHours(), m = d.getUTCMinutes();
  return `${DAYS[d.getUTCDay()]} ${MON[d.getUTCMonth()]} ${d.getUTCDate()}, ${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
/** Clock view -> campaign minutes. */
export function campaignMinutes(date: string, minutes: number) { return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.UTC(1974, 5, 21)) / 60000) + minutes; }

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e;
}

/** Feet/miles in the period's units (imperial default; metric is a setting). */
export function distance(m: number, metric = false) {
  if (metric) return m < 950 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
  const ft = m * 3.281; return ft < 900 ? `${Math.round(ft / 50) * 50} ft` : `${(m / 1609).toFixed(1)} mi`;
}
/** Manhattan blocks: ~80 m north-south. Period speech: "three blocks". */
export function blocks(m: number) { const b = Math.max(1, Math.round(m / 80)); return b === 1 ? 'a block' : `${b} blocks`; }
