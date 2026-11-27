/**
 * Fullscreen and "keep your saves" on iOS. iPhone WebKit has no element fullscreen (document.fullscreenEnabled
 * is false), and every iOS browser clears a site's storage after ~7 days away unless it's installed. Installing
 * to the Home Screen fixes both (the engine ships the manifest and icons), so one card explains it:
 *  - the fullscreen button opens it on iPhone (elsewhere it uses the Fullscreen API; installed, it hides);
 *  - after the first save on iOS, the same card opens with the saves wording (the old eviction note).
 * Styled as a printed instruction card: flat, straight, numbered steps (docs/research/UI_REFERENCES.md).
 */
export type FullscreenRoute = 'api' | 'install' | 'none';

export function isStandalone() {
  return (navigator as Navigator & { standalone?: boolean }).standalone === true
    || matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches;
}
export function isIOS() {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/** How the fullscreen button should behave on this device. `?ios=1` forces the iPhone route (lab and rigs). */
export function fullscreenRoute(): FullscreenRoute {
  if (isStandalone()) return 'none';
  const d = document as Document & { webkitFullscreenEnabled?: boolean };
  const forced = new URLSearchParams(location.search).get('ios') === '1';
  const enabled = !forced && (d.fullscreenEnabled ?? d.webkitFullscreenEnabled ?? false);
  if (enabled) return 'api';
  return isIOS() || forced ? 'install' : 'none';
}

export async function enterFullscreen() {
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
  try {
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' }); else await el.webkitRequestFullscreen?.();
    await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape');
  } catch { /* refused (no user gesture, policy): stay windowed */ }
}

const SHARE = '<i class="ic-share" aria-label="Share"></i>';
function steps(): string[] {
  const ua = navigator.userAgent;
  if (/CriOS/.test(ua)) return [`Tap ${SHARE} Share in the address bar`, 'Choose <b>Add to Home Screen</b>', 'Open <b>Tenderloin ’74</b> from your Home Screen'];
  if (/FxiOS|EdgiOS|OPiOS/.test(ua)) return ['Open the browser’s menu, then <b>Share</b>', 'Choose <b>Add to Home Screen</b>', 'Open <b>Tenderloin ’74</b> from your Home Screen'];
  return [`Tap ${SHARE} Share in the toolbar`, 'Scroll down and choose <b>Add to Home Screen</b>', 'Open <b>Tenderloin ’74</b> from your Home Screen'];
}

let open: HTMLElement | null = null;
/** Shows the card (once at a time). reason: what the player was trying to do. */
export function showInstallCard(reason: 'fullscreen' | 'saves', opts: { welcomeBack?: boolean } = {}) {
  open?.remove();
  const head = reason === 'fullscreen' ? 'Play full screen' : opts.welcomeBack ? 'Welcome back. Keep your saves safe' : 'Keep your saves';
  const why = reason === 'fullscreen'
    ? 'iPhone only plays full screen from the Home Screen. Installed, your saves are kept for good too.'
    : 'On iPhone and iPad, a browser clears saves after about a week away. From the Home Screen they’re kept for good, and the game fills the screen.';
  const n = document.createElement('div'); n.className = 'u-installcard'; n.setAttribute('role', 'dialog'); n.setAttribute('aria-label', head);
  n.innerHTML = `<div class="ic-head"><b>${head}</b><button class="ic-x" aria-label="Close">×</button></div><p>${why}</p>
    <ol>${steps().map((s) => `<li>${s}</li>`).join('')}</ol><div class="ic-foot"><button class="ic-ok">Got it</button></div>`;
  const close = () => { n.remove(); if (open === n) open = null; try { localStorage.setItem('t74.installCardSnooze', new Date().toISOString()); } catch { /* ignore */ } };
  n.querySelector('.ic-x')!.addEventListener('click', close); n.querySelector('.ic-ok')!.addEventListener('click', close);
  n.addEventListener('pointerdown', (e) => e.stopPropagation());
  document.body.appendChild(n); open = n;
  return n;
}
/** The saves reminder respects a 3-day snooze (the fullscreen card always opens: the player asked). */
export function installCardSnoozed() {
  try { return Date.now() - Date.parse(localStorage.getItem('t74.installCardSnooze') ?? '0') < 3 * 86400000; } catch { return false; }
}
