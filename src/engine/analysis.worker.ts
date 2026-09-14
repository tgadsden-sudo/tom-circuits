/**
 * Analysis runs in a Web Worker so that pitch detection (O(N·maxLag)) and the
 * FFT never block the rendering loop. Input: {id, block, sampleRate}.
 * Output: {id, measurements, spectrum}.
 */
import { measure, SpectrumAnalyzer } from '../signal/analysis';
import type { Measurements, SpectrumResult } from '../signal/types';

export interface AnalysisRequest {
  id: number;
  block: Float32Array;
  sampleRate: number;
}
export interface AnalysisResponse {
  id: number;
  measurements: Measurements;
  spectrum: SpectrumResult;
}

const analyzer = new SpectrumAnalyzer();

self.onmessage = (e: MessageEvent<AnalysisRequest>) => {
  const { id, block, sampleRate } = e.data;
  const measurements = measure(block, sampleRate);
  const spec = analyzer.analyze(block, sampleRate);
  // Copy magnitudes so the analyzer can reuse its buffer.
  const spectrum: SpectrumResult = { ...spec, magnitudesDb: new Float32Array(spec.magnitudesDb) };
  const msg: AnalysisResponse = { id, measurements, spectrum };
  (self as unknown as Worker).postMessage(msg, [spectrum.magnitudesDb.buffer]);
};
