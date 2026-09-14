import { DemoPlayback } from '../audio/demoPlayback';
import { LiveInputController, type ConnectOptions, type LiveConnection, type LiveDevice, type LiveStatus } from '../audio/liveInput';
import { FrequencyStabilizer } from '../signal/analysis';
import { DEFAULT_DEMO_PARAMS, DemoGenerator, describeDemo } from '../signal/generator';
import { RingBuffer } from '../signal/ring';
import { findTrigger } from '../signal/trigger';
import type {
  AcquisitionMeta,
  Capture,
  DemoParams,
  Measurements,
  SourceKind,
  SpectrumResult,
  TriggerConfig,
  TriggerState,
} from '../signal/types';
import { AnalysisClient } from './analysisClient';

export const TIME_PER_DIV_OPTIONS = [0.0001, 0.0002, 0.0005, 0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2] as const;
export const GAIN_OPTIONS = [0.5, 1, 2, 5, 10, 20, 50] as const;
export const H_DIVISIONS = 10;
export const V_DIVISIONS = 8;
/** Demo sample rate when playback is off (main-thread generator). */
export const DEMO_SAMPLE_RATE = 48000;
/** Ring buffer history in seconds (memory bound). */
export const HISTORY_SECONDS = 4;
export const PRE_TRIGGER_FRACTION = 0.1;
export const ANALYSIS_BLOCK = 4096;
export const ANALYSIS_INTERVAL_MS = 100;
export const MAX_SAMPLE_RATE = 192000;

export const DEFAULT_SETTINGS = {
  timePerDiv: 0.002,
  gain: 1,
  trigger: { mode: 'rising', level: 0, hysteresis: 0.02 } as TriggerConfig,
};

export type RunMode = 'run' | 'frozen' | 'single';

export interface ScopeSettings {
  timePerDiv: number;
  gain: number;
  trigger: TriggerConfig;
}

export interface EngineState {
  source: SourceKind;
  sourceLabel: string;
  sampleRate: number;
  settings: ScopeSettings;
  runMode: RunMode;
  triggerState: TriggerState;
  demo: DemoParams;
  playback: { running: boolean; volume: number };
  live: { status: LiveStatus; detail: string; devices: LiveDevice[]; deviceId: string; connection: LiveConnection | null };
  /** AudioContext state; iOS Safari also reports the non-standard 'interrupted'. */
  contextState: string;
  frozen: Capture | null;
  reference: Capture | null;
  /** Bumps whenever any of the above changes. */
  version: number;
}

/** What the renderer draws each frame. Not part of React state. */
export interface DisplayFrame {
  samples: Float32Array;
  start: number;
  length: number;
  /** Index (absolute in samples) of trigger, or -1. */
  triggerIndex: number;
  sampleRate: number;
  timePerDiv: number;
  gain: number;
  trigger: TriggerConfig;
  triggerState: TriggerState;
  frozen: boolean;
  /** True while the ring does not yet hold a full window. */
  filling: boolean;
  sourceLabel: string;
  reference: Capture | null;
  inputClipping: boolean;
}

export interface AnalysisSnapshot {
  measurements: Measurements | null;
  spectrum: SpectrumResult | null;
  version: number;
}

type Listener = () => void;

export class ScopeEngine {
  private ring: RingBuffer;
  private generator: DemoGenerator;
  private demoTimer: number | null = null;
  private demoLastTime = 0;
  private demoScratch = new Float32Array(MAX_SAMPLE_RATE / 2);
  private playback: DemoPlayback;
  private live: LiveInputController;
  private analysis: AnalysisClient;
  private stabilizer = new FrequencyStabilizer();
  private lastAnalysisTime = 0;
  private analysisBlock = new Float32Array(ANALYSIS_BLOCK);

  /** Reusable display buffers. */
  private searchBuf = new Float32Array(0);
  private displayBuf = new Float32Array(0);
  private displayLen = 0;
  private displayTrigger = -1;
  private displayOffsetFromEnd = 0;
  /** ring.totalWritten at the moment the display window was computed, so a later freeze can correct for samples pushed since. */
  private displayTotal = 0;
  private lastTriggerTime = 0;
  private lastInputClipping = false;

  private state: EngineState;
  private analysisSnap: AnalysisSnapshot = { measurements: null, spectrum: null, version: 0 };
  private stateListeners = new Set<Listener>();
  private analysisListeners = new Set<Listener>();
  private disposed = false;

  constructor() {
    this.ring = new RingBuffer(DEMO_SAMPLE_RATE * HISTORY_SECONDS);
    this.generator = new DemoGenerator(DEMO_SAMPLE_RATE, DEFAULT_DEMO_PARAMS);
    this.playback = new DemoPlayback(
      (block) => this.onPlaybackBlock(block),
      (s) => this.setContextState(s),
    );
    this.live = new LiveInputController({
      onBlock: (block) => this.onLiveBlock(block),
      onStatus: (status, detail) => this.onLiveStatus(status, detail),
      onDevices: (devices) => this.patch({ live: { ...this.state.live, devices } }),
      onContextState: (s) => this.setContextState(s),
    });
    this.analysis = new AnalysisClient((out) => this.onAnalysis(out));
    this.state = {
      source: 'demo',
      sourceLabel: describeDemo(DEFAULT_DEMO_PARAMS),
      sampleRate: DEMO_SAMPLE_RATE,
      settings: { ...DEFAULT_SETTINGS, trigger: { ...DEFAULT_SETTINGS.trigger } },
      runMode: 'run',
      triggerState: 'waiting',
      demo: { ...DEFAULT_DEMO_PARAMS },
      playback: { running: false, volume: this.playback.volume },
      live: { status: 'idle', detail: '', devices: [], deviceId: '', connection: null },
      contextState: 'none',
      frozen: null,
      reference: null,
      version: 0,
    };
    this.startDemoFeed();
  }

  /* ---------------- store plumbing ---------------- */

  subscribe(l: Listener): () => void {
    this.stateListeners.add(l);
    return () => this.stateListeners.delete(l);
  }
  subscribeAnalysis(l: Listener): () => void {
    this.analysisListeners.add(l);
    return () => this.analysisListeners.delete(l);
  }
  getState(): EngineState {
    return this.state;
  }
  getAnalysis(): AnalysisSnapshot {
    return this.analysisSnap;
  }
  private patch(p: Partial<EngineState>): void {
    this.state = { ...this.state, ...p, version: this.state.version + 1 };
    for (const l of this.stateListeners) l();
  }

  /* ---------------- demo ---------------- */

  private startDemoFeed(): void {
    this.stopDemoFeed();
    this.demoLastTime = performance.now();
    this.demoTimer = window.setInterval(() => this.demoTick(), 40);
  }
  private stopDemoFeed(): void {
    if (this.demoTimer !== null) {
      clearInterval(this.demoTimer);
      this.demoTimer = null;
    }
  }
  private demoTick(): void {
    const now = performance.now();
    let dt = (now - this.demoLastTime) / 1000;
    this.demoLastTime = now;
    if (dt > 0.25) dt = 0.25; // background tab: bound the catch-up work
    let count = Math.round(dt * this.generator.sampleRate);
    while (count > 0) {
      const n = Math.min(count, this.demoScratch.length);
      this.generator.generate(this.demoScratch, n);
      this.ring.push(this.demoScratch.subarray(0, n));
      count -= n;
    }
  }

  setDemoParams(p: Partial<DemoParams>): void {
    const demo = { ...this.state.demo, ...p };
    this.generator.setParams(demo);
    this.playback.setParams(demo);
    this.stabilizer.reset();
    this.patch({ demo, sourceLabel: this.state.source === 'demo' ? describeDemo(demo) : this.state.sourceLabel });
  }

  async startPlayback(): Promise<void> {
    if (this.state.source !== 'demo') return;
    const sr = await this.playback.start(this.state.demo);
    if (this.disposed) {
      this.playback.stop();
      return;
    }
    this.stopDemoFeed();
    this.setSampleRate(sr);
    this.patch({ playback: { running: true, volume: this.playback.volume } });
  }

  stopPlayback(): void {
    if (!this.playback.running) return;
    this.playback.stop();
    if (this.state.source === 'demo') {
      this.setSampleRate(DEMO_SAMPLE_RATE);
      this.startDemoFeed();
    }
    this.patch({ playback: { running: false, volume: this.playback.volume }, contextState: this.state.contextState });
  }

  setPlaybackVolume(v: number): void {
    this.playback.setVolume(v);
    this.patch({ playback: { running: this.playback.running, volume: this.playback.volume } });
  }

  private onPlaybackBlock(block: Float32Array): void {
    if (this.state.source === 'demo' && this.playback.running) this.ring.push(block);
  }

  /* ---------------- sources ---------------- */

  private setSampleRate(sr: number): void {
    if (sr !== this.state.sampleRate || this.ring.capacity !== sr * HISTORY_SECONDS) {
      this.ring = new RingBuffer(Math.min(MAX_SAMPLE_RATE, Math.round(sr)) * HISTORY_SECONDS);
      this.displayLen = 0;
      this.displayTrigger = -1;
      this.displayTotal = 0;
      this.stabilizer.reset();
      this.patch({ sampleRate: sr });
    } else {
      this.ring.clear();
    }
  }

  /** Switch to demo mode; releases any live input and (if needed) stops playback. */
  selectDemo(): void {
    if (this.state.source === 'demo') return;
    this.live.disconnect(false);
    this.setSampleRate(DEMO_SAMPLE_RATE);
    this.startDemoFeed();
    this.patch({
      source: 'demo',
      sourceLabel: describeDemo(this.state.demo),
      live: { ...this.state.live, status: 'idle', detail: '', connection: null },
      runMode: this.state.runMode === 'frozen' ? 'frozen' : 'run',
    });
  }

  /** Switch the UI to a live mode without requesting permission yet. */
  selectLiveMode(kind: 'microphone' | 'external'): void {
    if (this.state.source === kind) return;
    // Any audible demo must stop before a microphone can be opened (feedback).
    if (this.playback.running) {
      this.playback.stop();
    }
    this.stopDemoFeed();
    const wasLive = this.state.source !== 'demo';
    if (!wasLive) {
      this.ring.clear();
      this.displayLen = 0;
    }
    this.patch({
      source: kind,
      playback: { running: false, volume: this.playback.volume },
      sourceLabel: wasLive && this.state.live.connection ? this.state.live.connection.deviceLabel : notConnectedLabel(kind),
    });
  }

  async connectLive(opts: ConnectOptions | string = {}): Promise<void> {
    if (this.state.source === 'demo') return;
    const options: ConnectOptions = typeof opts === 'string' ? { deviceId: opts } : opts;
    if (this.playback.running) this.playback.stop();
    this.stopDemoFeed();
    this.patch({ playback: { running: false, volume: this.playback.volume } });
    try {
      const conn = await this.live.connect(options);
      if (!conn || this.disposed) return;
      this.setSampleRate(conn.sampleRate);
      this.patch({
        sourceLabel: conn.deviceLabel,
        live: { ...this.state.live, connection: conn, deviceId: conn.deviceId },
        runMode: this.state.runMode === 'frozen' ? 'frozen' : 'run',
      });
    } catch {
      /* status already reported through onLiveStatus */
    }
  }

  /** Rescan inputs and reconnect, preferring a likely external adapter (used after plugging in late). */
  async reconnectLive(deviceId?: string): Promise<void> {
    if (this.state.source === 'demo') return;
    await this.connectLive({ deviceId, preferExternal: !deviceId });
  }

  cancelConnect(): void {
    this.live.cancel();
  }

  disconnectLive(): void {
    this.live.disconnect(true);
    this.patch({
      live: { ...this.state.live, connection: null },
      sourceLabel: notConnectedLabel(this.state.source),
    });
  }

  async refreshDevices(): Promise<void> {
    try {
      await this.live.listDevices();
    } catch {
      /* ignore */
    }
  }

  async resumeAudio(): Promise<void> {
    await this.playback.resumeContext();
    await this.live.resumeContext();
  }

  private onLiveStatus(status: LiveStatus, detail: string): void {
    const keepsConnection = status === 'connected' || status === 'muted';
    const label = status === 'connected' && detail ? detail : this.state.live.connection?.deviceLabel ?? '';
    this.patch({
      live: { ...this.state.live, status, detail, connection: keepsConnection ? this.state.live.connection : null },
      sourceLabel: keepsConnection ? label || this.state.sourceLabel : this.state.source === 'demo' ? this.state.sourceLabel : notConnectedLabel(this.state.source),
    });
  }

  private onLiveBlock(block: Float32Array): void {
    if (this.state.source !== 'demo' && this.state.live.status === 'connected') this.ring.push(block);
  }

  private setContextState(s: string): void {
    if (s !== this.state.contextState) this.patch({ contextState: s });
  }

  /* ---------------- settings ---------------- */

  setTimePerDiv(t: number): void {
    const settings = { ...this.state.settings, timePerDiv: t };
    this.patch({ settings, frozen: this.state.frozen ? resliceCapture(this.state.frozen, t) : null });
  }
  setGain(g: number): void {
    this.patch({ settings: { ...this.state.settings, gain: g } });
  }
  setTrigger(t: Partial<TriggerConfig>): void {
    this.patch({ settings: { ...this.state.settings, trigger: { ...this.state.settings.trigger, ...t } } });
  }
  resetDefaults(): void {
    const settings = { ...DEFAULT_SETTINGS, trigger: { ...DEFAULT_SETTINGS.trigger } };
    this.patch({ settings, frozen: this.state.frozen ? resliceCapture(this.state.frozen, settings.timePerDiv) : null });
  }

  /** Auto-scale: pick gain so the analysed peak fills ~70% of the screen, and time/div to show ~3 periods. */
  autoScale(): void {
    const m = this.analysisSnap.measurements;
    let gain = this.state.settings.gain;
    let timePerDiv = this.state.settings.timePerDiv;
    if (m && m.peakAbs > 1e-4) {
      const target = 0.7 / m.peakAbs; // full screen = ±1/gain
      gain = nearest(GAIN_OPTIONS, target, true);
    }
    if (m && m.frequency.status === 'ok') {
      const wanted = (3 / m.frequency.hz) / H_DIVISIONS;
      timePerDiv = nearest(TIME_PER_DIV_OPTIONS, wanted, false);
    }
    this.patch({
      settings: { ...this.state.settings, gain, timePerDiv },
      frozen: this.state.frozen ? resliceCapture(this.state.frozen, timePerDiv) : null,
    });
  }

  /* ---------------- run / freeze ---------------- */

  windowLength(): number {
    return Math.max(2, Math.round(this.state.settings.timePerDiv * H_DIVISIONS * this.state.sampleRate));
  }

  run(): void {
    this.patch({ runMode: 'run', frozen: null, triggerState: this.state.settings.trigger.mode === 'free' ? 'free-running' : 'waiting' });
  }

  freeze(): void {
    if (this.state.runMode === 'frozen') return;
    const cap = this.makeCapture();
    this.patch({ runMode: 'frozen', frozen: cap, triggerState: 'frozen' });
  }

  toggleRun(): void {
    if (this.state.runMode === 'frozen') this.run();
    else this.freeze();
  }

  /** Arm single capture: freeze on the next qualifying trigger (or next window when free-running). */
  single(): void {
    this.patch({ runMode: 'single', frozen: null, triggerState: 'armed' });
  }

  keepReference(): void {
    const cap = this.state.frozen ?? this.makeCapture();
    this.patch({ reference: cap });
  }
  clearReference(): void {
    this.patch({ reference: null });
  }

  private meta(): AcquisitionMeta {
    const notes: string[] = [];
    if (this.state.source === 'demo') {
      notes.push('Simulated demo signal generated in software; not a measurement of any physical circuit.');
      notes.push(this.state.playback.running ? 'Samples are those sent to the audio output (audible playback on).' : 'Generated on the main thread at a nominal 48 kHz.');
    } else {
      notes.push('Live audio input. Values are normalized digital amplitude after the device\'s analogue front end and any browser/OS processing; not calibrated to volts.');
      if (this.state.source === 'microphone') notes.push('Acoustic capture: the microphone, air and room have altered the original signal.');
      const c = this.state.live.connection;
      if (c) {
        notes.push(`input identity: ${c.identity.identity} (${c.identity.reason})`);
        if (c.captureSampleRate && c.captureSampleRate !== c.sampleRate) notes.push(`capture sample rate reported by track: ${c.captureSampleRate} Hz; resampled by the browser to the ${c.sampleRate} Hz processing rate used here.`);
        if (c.sampleSize) notes.push(`sample size reported by track: ${c.sampleSize} bit (samples are delivered to the app as 32-bit float).`);
        for (const n of c.processingNotes) notes.push(n);
      }
    }
    return {
      source: this.state.source,
      sourceLabel: this.state.sourceLabel,
      sampleRate: this.state.sampleRate,
      capturedAt: new Date().toISOString(),
      notes,
    };
  }

  private makeCapture(): Capture {
    const samples = this.ring.snapshot();
    const len = Math.min(this.displayLen || this.windowLength(), samples.length);
    // Samples pushed since the display window was computed shift it further from the end.
    const drift = Math.max(0, this.ring.totalWritten - this.displayTotal);
    let start = samples.length - (this.displayOffsetFromEnd + drift);
    if (this.displayLen === 0 || start < 0) start = samples.length - len;
    start = Math.max(0, Math.min(start, samples.length - len));
    const trig = this.displayTrigger >= 0 ? start + this.displayTrigger : -1;
    return { samples, sampleRate: this.state.sampleRate, windowStart: start, windowLength: len, triggerIndex: trig, meta: this.meta() };
  }

  /* ---------------- per-frame ---------------- */

  /**
   * Called by the renderer on every animation frame. Updates the display
   * window from the ring (unless frozen) and triggers throttled analysis.
   * Returns the frame to draw.
   */
  frame(now: number): DisplayFrame {
    const s = this.state;
    const trigger = s.settings.trigger;
    const winLen = this.windowLength();
    const pre = Math.floor(winLen * PRE_TRIGGER_FRACTION);
    let filling = false;

    if (s.runMode !== 'frozen') {
      if (this.displayBuf.length < winLen) this.displayBuf = new Float32Array(winLen);
      if (trigger.mode === 'free') {
        const got = this.ring.latest(winLen, this.displayBuf);
        filling = got < winLen;
        this.displayLen = winLen;
        this.displayTrigger = -1;
        this.displayOffsetFromEnd = winLen;
        this.displayTotal = this.ring.totalWritten;
        if (s.triggerState !== 'free-running' && s.runMode === 'run') this.setTriggerState('free-running');
        if (s.runMode === 'single' && !filling) {
          this.patch({ runMode: 'frozen', frozen: this.makeCapture(), triggerState: 'frozen' });
        }
      } else {
        // Search region: enough history to find a crossing for a full window.
        const searchLen = Math.min(this.ring.capacity, winLen + Math.max(winLen, Math.round(s.sampleRate * 0.25)));
        if (this.searchBuf.length < searchLen) this.searchBuf = new Float32Array(searchLen);
        const region = this.searchBuf.subarray(0, searchLen);
        const got = this.ring.latest(searchLen, region);
        filling = got < winLen;
        const res = findTrigger(got < searchLen ? region.subarray(searchLen - got) : region, trigger, winLen, pre);
        if (res.index >= 0) {
          const base = got < searchLen ? searchLen - got : 0;
          const start = base + res.index - pre;
          this.displayBuf.set(region.subarray(start, start + winLen));
          this.displayLen = winLen;
          this.displayTrigger = pre;
          this.displayOffsetFromEnd = searchLen - start;
          this.displayTotal = this.ring.totalWritten;
          this.lastTriggerTime = now;
          if (s.runMode === 'single') {
            this.patch({ runMode: 'frozen', frozen: this.makeCapture(), triggerState: 'frozen' });
          } else if (s.triggerState !== 'triggered') this.setTriggerState('triggered');
        } else {
          const stale = now - this.lastTriggerTime > 500;
          const want: TriggerState = s.runMode === 'single' ? 'armed' : stale ? 'no-crossing' : 'waiting';
          if (want === 'no-crossing' || (want === 'armed' && this.displayLen === 0)) {
            // Nothing qualifies: show the newest untriggered samples (drawn dimmed)
            // rather than a stale or empty screen.
            this.ring.latest(winLen, this.displayBuf);
            this.displayLen = winLen;
            this.displayTrigger = -1;
            this.displayOffsetFromEnd = winLen;
            this.displayTotal = this.ring.totalWritten;
          }
          if (s.triggerState !== want) this.setTriggerState(want);
        }
      }
    }

    // Throttled analysis (off the render path, in a worker).
    if (now - this.lastAnalysisTime >= ANALYSIS_INTERVAL_MS) {
      const block = this.analysisBlock;
      let ok = false;
      if (s.runMode === 'frozen' && s.frozen) {
        const c = s.frozen;
        const end = Math.min(c.samples.length, c.windowStart + c.windowLength);
        const start = Math.max(0, end - block.length);
        const n = end - start;
        block.fill(0, 0, block.length - n);
        block.set(c.samples.subarray(start, end), block.length - n);
        ok = n >= 256;
      } else {
        ok = this.ring.latest(block.length, block) >= 256;
      }
      if (ok && this.analysis.request(block, s.sampleRate)) this.lastAnalysisTime = now;
    }

    const frozen = s.runMode === 'frozen' && s.frozen;
    if (frozen) {
      const c = s.frozen!;
      return {
        samples: c.samples,
        start: c.windowStart,
        length: c.windowLength,
        triggerIndex: c.triggerIndex,
        sampleRate: c.sampleRate,
        timePerDiv: s.settings.timePerDiv,
        gain: s.settings.gain,
        trigger,
        triggerState: 'frozen',
        frozen: true,
        filling: false,
        sourceLabel: c.meta.sourceLabel,
        reference: s.reference,
        inputClipping: this.lastInputClipping,
      };
    }
    return {
      samples: this.displayBuf,
      start: 0,
      length: this.displayLen,
      triggerIndex: this.displayTrigger,
      sampleRate: s.sampleRate,
      timePerDiv: s.settings.timePerDiv,
      gain: s.settings.gain,
      trigger,
      triggerState: s.triggerState,
      frozen: false,
      filling,
      sourceLabel: s.sourceLabel,
      reference: s.reference,
      inputClipping: this.lastInputClipping,
    };
  }

  private setTriggerState(t: TriggerState): void {
    this.patch({ triggerState: t });
  }

  private onAnalysis(out: { measurements: Measurements; spectrum: SpectrumResult }): void {
    if (this.disposed) return;
    const m = out.measurements;
    const frequency = this.state.runMode === 'frozen' ? m.frequency : this.stabilizer.apply(m.frequency);
    const measurements: Measurements = { ...m, frequency, periodSeconds: frequency.status === 'ok' ? 1 / frequency.hz : NaN };
    this.lastInputClipping = measurements.inputClipping;
    this.analysisSnap = { measurements, spectrum: out.spectrum, version: this.analysisSnap.version + 1 };
    for (const l of this.analysisListeners) l();
  }

  dispose(): void {
    this.disposed = true;
    this.stopDemoFeed();
    this.playback.stop();
    this.live.disconnect(false);
    this.analysis.dispose();
    this.stateListeners.clear();
    this.analysisListeners.clear();
  }
}

export function notConnectedLabel(kind: SourceKind): string {
  return kind === 'microphone' ? 'Microphone (not connected)' : 'USB audio input (not connected)';
}

function nearest(options: readonly number[], value: number, floor: boolean): number {
  if (floor) {
    const le = options.filter((o) => o <= value);
    return le.length ? Math.max(...le) : Math.min(...options);
  }
  let best = options[0];
  for (const o of options) {
    if (Math.abs(Math.log(o / value)) < Math.abs(Math.log(best / value))) best = o;
  }
  return best;
}

/** Re-position a frozen capture's window for a new time/div, anchored on the trigger (or window start). */
export function resliceCapture(c: Capture, timePerDiv: number): Capture {
  const len = Math.max(2, Math.min(c.samples.length, Math.round(timePerDiv * H_DIVISIONS * c.sampleRate)));
  const pre = Math.floor(len * PRE_TRIGGER_FRACTION);
  let start = c.triggerIndex >= 0 ? c.triggerIndex - pre : c.windowStart + c.windowLength - len;
  start = Math.max(0, Math.min(start, c.samples.length - len));
  return { ...c, windowStart: start, windowLength: len };
}
