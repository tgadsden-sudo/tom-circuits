import { measure, SpectrumAnalyzer } from '../signal/analysis';
import type { Measurements, SpectrumResult } from '../signal/types';
import type { AnalysisRequest, AnalysisResponse } from './analysis.worker';

export interface AnalysisOutput {
  measurements: Measurements;
  spectrum: SpectrumResult;
}

/**
 * Sends analysis blocks to the worker; drops requests while one is in flight
 * so the worker never builds a backlog. Falls back to inline analysis when
 * Workers are unavailable.
 */
export class AnalysisClient {
  private worker: Worker | null = null;
  private inflight = false;
  private nextId = 1;
  private inline: SpectrumAnalyzer | null = null;

  private onResult: (out: AnalysisOutput) => void;

  constructor(onResult: (out: AnalysisOutput) => void) {
    this.onResult = onResult;
    try {
      this.worker = new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent<AnalysisResponse>) => {
        this.inflight = false;
        this.onResult({ measurements: e.data.measurements, spectrum: e.data.spectrum });
      };
      this.worker.onerror = () => {
        this.worker?.terminate();
        this.worker = null;
        this.inflight = false;
      };
    } catch {
      this.worker = null;
    }
  }

  /** Returns false when the request was dropped because one is in flight. */
  request(block: Float32Array, sampleRate: number): boolean {
    if (this.worker) {
      if (this.inflight) return false;
      this.inflight = true;
      const copy = new Float32Array(block);
      const msg: AnalysisRequest = { id: this.nextId++, block: copy, sampleRate };
      this.worker.postMessage(msg, [copy.buffer]);
      return true;
    }
    if (!this.inline) this.inline = new SpectrumAnalyzer();
    const measurements = measure(block, sampleRate);
    const spec = this.inline.analyze(block, sampleRate);
    this.onResult({ measurements, spectrum: { ...spec, magnitudesDb: new Float32Array(spec.magnitudesDb) } });
    return true;
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
  }
}
