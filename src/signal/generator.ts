import type { DemoParams, DemoWaveform } from './types';

/**
 * Demo signal generator.
 *
 * Square, triangle and sawtooth are synthesised additively from their Fourier
 * series with every harmonic kept below the Nyquist frequency, so the sampled
 * signal is band-limited and does not alias. This means a low-frequency square
 * wave shows small Gibbs ripple at the edges instead of perfectly flat tops —
 * that ripple is a genuine property of a band-limited square wave, not a bug.
 *
 * The class has no DOM or Web Audio dependencies so the identical code runs
 * on the main thread (silent demo) and inside an AudioWorklet (audible demo).
 */
export const DEFAULT_DEMO_PARAMS: DemoParams = {
  waveform: 'sine',
  frequency: 440,
  amplitude: 0.6,
  dutyCycle: 0.5,
  sirenLow: 400,
  sirenHigh: 1200,
  sirenRate: 0.5,
};

const TWO_PI = Math.PI * 2;
const MAX_HARMONICS = 256;

/** Small deterministic PRNG (xorshift32) so tests are reproducible. */
export class Rng {
  private s: number;
  constructor(seed = 0x9e3779b9) {
    this.s = seed >>> 0 || 1;
  }
  next(): number {
    let x = this.s;
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    this.s = x;
    return x / 4294967296;
  }
}

export class DemoGenerator {
  private phase = 0; // 0..1 cycle fraction
  private sirenPhase = 0; // 0..1 sweep cycle fraction
  private rng: Rng;
  params: DemoParams;
  readonly sampleRate: number;

  constructor(sampleRate: number, params: DemoParams = DEFAULT_DEMO_PARAMS, seed?: number) {
    this.sampleRate = sampleRate;
    this.params = { ...params };
    this.rng = new Rng(seed);
  }

  setParams(p: Partial<DemoParams>): void {
    this.params = { ...this.params, ...p };
  }

  /** Instantaneous frequency in Hz for the current sample. */
  private currentFrequency(): number {
    const p = this.params;
    if (p.waveform === 'siren') {
      // Triangle sweep between low and high.
      const t = this.sirenPhase;
      const frac = t < 0.5 ? t * 2 : 2 - t * 2;
      const lo = Math.min(p.sirenLow, p.sirenHigh);
      const hi = Math.max(p.sirenLow, p.sirenHigh);
      // Exponential (musical) sweep sounds more like a siren than linear.
      return lo * Math.pow(hi / lo, frac);
    }
    return p.frequency;
  }

  /** Fill `out` with the next samples. Returns the number written. */
  generate(out: Float32Array, count = out.length): number {
    const p = this.params;
    const sr = this.sampleRate;
    const nyquist = sr / 2;
    for (let i = 0; i < count; i++) {
      const f = this.currentFrequency();
      let v: number;
      switch (p.waveform) {
        case 'noise':
          v = this.rng.next() * 2 - 1;
          break;
        case 'sine':
        case 'siren':
          v = Math.sin(TWO_PI * this.phase);
          break;
        case 'square':
          v = bandLimitedSquare(this.phase, p.dutyCycle, f, nyquist);
          break;
        case 'triangle':
          v = bandLimitedTriangle(this.phase, f, nyquist);
          break;
        case 'sawtooth':
          v = bandLimitedSaw(this.phase, f, nyquist);
          break;
        default:
          v = 0;
      }
      out[i] = v * p.amplitude;
      this.phase += f / sr;
      if (this.phase >= 1) this.phase -= Math.floor(this.phase);
      if (p.waveform === 'siren') {
        this.sirenPhase += p.sirenRate / sr;
        if (this.sirenPhase >= 1) this.sirenPhase -= Math.floor(this.sirenPhase);
      }
    }
    return count;
  }
}

function harmonicCount(f: number, nyquist: number): number {
  if (f <= 0) return 0;
  return Math.min(MAX_HARMONICS, Math.floor((nyquist * 0.98) / f));
}

/**
 * Band-limited pulse wave with duty cycle d, DC-centred so its mean is ~0 and
 * its peak stays within about +/-1 (Gibbs overshoot included).
 * Fourier series of a pulse (high for fraction d): a_k = (2/(k*pi)) * sin(k*pi*d).
 */
export function bandLimitedSquare(phase: number, duty: number, f: number, nyquist: number): number {
  const n = harmonicCount(f, nyquist);
  let v = 0;
  for (let k = 1; k <= n; k++) {
    const kpi = k * Math.PI;
    const a = (2 / kpi) * Math.sin(kpi * duty);
    v += a * Math.cos(TWO_PI * k * (phase - duty / 2));
  }
  // Amplitude of the ideal wave is 1-d above the mean and -d below; scale so
  // the peak-to-peak span is 2 (i.e. swings -1..+1 for duty 0.5).
  return v / Math.max(duty, 1 - duty);
}

export function bandLimitedTriangle(phase: number, f: number, nyquist: number): number {
  const n = harmonicCount(f, nyquist);
  let v = 0;
  for (let k = 1; k <= n; k += 2) {
    const sign = ((k - 1) / 2) % 2 === 0 ? 1 : -1;
    v += (sign / (k * k)) * Math.sin(TWO_PI * k * phase);
  }
  return (8 / (Math.PI * Math.PI)) * v;
}

export function bandLimitedSaw(phase: number, f: number, nyquist: number): number {
  const n = harmonicCount(f, nyquist);
  let v = 0;
  for (let k = 1; k <= n; k++) {
    v += (Math.pow(-1, k + 1) / k) * Math.sin(TWO_PI * k * phase);
  }
  return (2 / Math.PI) * v;
}

export const WAVEFORM_LABELS: Record<DemoWaveform, string> = {
  sine: 'Sine',
  square: 'Square',
  triangle: 'Triangle',
  sawtooth: 'Sawtooth',
  noise: 'White noise',
  siren: 'Siren (sweep)',
};

export function describeDemo(p: DemoParams): string {
  switch (p.waveform) {
    case 'noise':
      return 'Demo: white noise';
    case 'siren':
      return `Demo: siren ${Math.round(p.sirenLow)}–${Math.round(p.sirenHigh)} Hz`;
    case 'square':
      return `Demo: square ${formatHz(p.frequency)} (${Math.round(p.dutyCycle * 100)}% duty)`;
    default:
      return `Demo: ${WAVEFORM_LABELS[p.waveform].toLowerCase()} ${formatHz(p.frequency)}`;
  }
}

export function formatHz(hz: number): string {
  if (!Number.isFinite(hz)) return '—';
  if (hz >= 1000) return `${(hz / 1000).toFixed(hz >= 10000 ? 1 : 2)} kHz`;
  return `${hz.toFixed(hz < 100 ? 1 : 0)} Hz`;
}
