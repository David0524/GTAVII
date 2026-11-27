/**
 * AudioContext lifecycle: creation, worklet loading, the iOS/Safari unlock, and suspend/resume
 * across backgrounding, phone calls (Safari's 'interrupted' state), bfcache and focus loss.
 *
 * Rules that keep audio from sticking or doubling:
 *  - One context for the life of the page; never recreate on resume.
 *  - Resume only from 'suspended'/'interrupted', and only when the page is visible and the
 *    game has not asked to stay suspended. A pending resume() is shared, never stacked.
 *  - While not running, the simulation-facing layer stops scheduling (see AudioSystem.update),
 *    so nothing queues up and bursts out on resume.
 *  - If Safari leaves the context suspended after an interruption, the gesture listeners are
 *    re-armed so the next tap brings audio back.
 */
import processorsUrl from '../worklets/processors.ts?worker&url';

type AnyCtx = AudioContext | OfflineAudioContext;

export class AudioRuntime {
  readonly ctx: AnyCtx;
  readonly offline: boolean;
  ready: Promise<void>;
  unlocked = false;
  /** True when the game (or the OS) wants audio paused. */
  private wantSuspended = false;
  private resuming: Promise<void> | null = null;
  private listeners: [EventTarget, string, EventListener, AddEventListenerOptions | boolean][] = [];
  private gestureArmed = false;
  onStateChange: ((s: string) => void) | null = null;
  readonly log: string[] = [];

  constructor(opts: { context?: AnyCtx; latencyHint?: AudioContextLatencyCategory; sampleRate?: number }) {
    if (opts.context) {
      this.ctx = opts.context;
    } else {
      const Ctor: typeof AudioContext = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor({ latencyHint: opts.latencyHint ?? 'interactive', sampleRate: opts.sampleRate });
    }
    this.offline = typeof OfflineAudioContext !== 'undefined' && this.ctx instanceof OfflineAudioContext;
    this.ready = this.ctx.audioWorklet.addModule(processorsUrl);
    if (!this.offline) this.installLifecycle();
  }

  get state(): string { return (this.ctx as AudioContext).state; }
  get running() { return this.offline || this.state === 'running'; }

  private on(t: EventTarget, type: string, fn: EventListener, o: AddEventListenerOptions | boolean = false) {
    t.addEventListener(type, fn, o); this.listeners.push([t, type, fn, o]);
  }

  private installLifecycle() {
    const ctx = this.ctx as AudioContext;
    // iOS: the ring/silent switch mutes Web Audio under the default session ('auto'/'ambient').
    // 'playback' makes the game audible with the switch on; that is a user setting (see setIgnoreSilentSwitch).
    this.armGesture();
    ctx.onstatechange = () => {
      this.log.push(`${(performance.now() / 1000).toFixed(2)} state=${ctx.state}`);
      this.onStateChange?.(ctx.state);
      if (ctx.state !== 'running' && !this.wantSuspended) this.armGesture();
    };
    this.on(document, 'visibilitychange', () => { if (document.hidden) this.osSuspend('hidden'); else this.osResume('visible'); });
    this.on(window, 'pagehide', () => this.osSuspend('pagehide'));
    this.on(window, 'pageshow', () => this.osResume('pageshow'));
    this.on(document, 'freeze', () => this.osSuspend('freeze'));
    this.on(document, 'resume', () => this.osResume('resume'));
    this.on(window, 'focus', () => this.osResume('focus'));
  }

  private osHidden = false;
  private osSuspend(why: string) {
    this.osHidden = true; this.log.push(`os-suspend ${why}`);
    if (this.state === 'running') void (this.ctx as AudioContext).suspend();
  }
  private osResume(why: string) {
    if (document.hidden) return;
    this.osHidden = false; this.log.push(`os-resume ${why}`);
    if (!this.wantSuspended && this.unlocked) void this.tryResume();
  }

  /** Gesture listeners: capture phase on window so UI handlers that stop propagation can't swallow them. */
  private armGesture() {
    if (this.gestureArmed || this.offline) return;
    this.gestureArmed = true;
    const fn = () => { void this.unlock(); };
    for (const t of ['pointerup', 'touchend', 'click', 'keydown', 'mousedown']) this.on(window, t, fn, { capture: true, passive: true });
  }
  private disarmGesture() {
    this.gestureArmed = false;
    this.listeners = this.listeners.filter(([t, type, fn, o]) => {
      if (['pointerup', 'touchend', 'click', 'keydown', 'mousedown'].includes(type) && t === window) { t.removeEventListener(type, fn, o); return false; }
      return true;
    });
  }

  /** Call from (or let it run on) the first user gesture. Safe to call repeatedly. */
  async unlock(): Promise<void> {
    if (this.offline) { this.unlocked = true; return; }
    const ctx = this.ctx as AudioContext;
    // A one-sample silent buffer started inside the gesture is what older iOS needs to unmute.
    try {
      const b = ctx.createBuffer(1, 1, ctx.sampleRate); const s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0);
      s.onended = () => s.disconnect();
    } catch { /* ignore */ }
    if (this.wantSuspended || this.osHidden) { this.unlocked = true; return; }
    await this.tryResume();
    if (ctx.state === 'running') { this.unlocked = true; this.disarmGesture(); }
  }

  private tryResume(): Promise<void> {
    const ctx = this.ctx as AudioContext;
    if (ctx.state === 'running' || ctx.state === 'closed') return Promise.resolve();
    if (!this.resuming) {
      this.resuming = ctx.resume().catch((e) => { this.log.push(`resume failed ${e}`); }).finally(() => { this.resuming = null; if (ctx.state !== 'running') this.armGesture(); });
    }
    return this.resuming;
  }

  /** Game-requested pause (pause menu, app background handled automatically). */
  suspend() { this.wantSuspended = true; if (!this.offline && this.state === 'running') void (this.ctx as AudioContext).suspend(); }
  resume() { this.wantSuspended = false; if (!this.offline && !this.osHidden) void this.tryResume(); }

  setIgnoreSilentSwitch(on: boolean) {
    const s = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
    if (s) try { s.type = on ? 'playback' : 'auto'; } catch { /* unsupported */ }
  }

  dispose() {
    for (const [t, type, fn, o] of this.listeners) t.removeEventListener(type, fn, o);
    this.listeners = [];
    if (!this.offline) { (this.ctx as AudioContext).onstatechange = null; void (this.ctx as AudioContext).close(); }
  }
}
