/**
 * AudioWorklet processor that runs the same DemoGenerator used for the silent
 * demo. It writes the samples to its output (audible) AND posts the identical
 * samples to the main thread (displayed), so what you hear is what you see.
 */
import { DemoGenerator, DEFAULT_DEMO_PARAMS } from '../signal/generator';
import type { DemoParams } from '../signal/types';

const BLOCK = 2048;

class DemoProcessor extends AudioWorkletProcessor {
  private gen: DemoGenerator;
  private buf = new Float32Array(BLOCK);
  private fill = 0;

  constructor(options?: AudioWorkletNodeOptions) {
    super();
    const params = (options?.processorOptions?.params as DemoParams | undefined) ?? DEFAULT_DEMO_PARAMS;
    this.gen = new DemoGenerator(sampleRate, params, (Date.now() & 0x7fffffff) || 1);
    this.port.onmessage = (e: MessageEvent) => {
      if (e.data?.type === 'params') this.gen.setParams(e.data.params as Partial<DemoParams>);
    };
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0];
    if (!out || !out[0]) return true;
    const ch0 = out[0];
    this.gen.generate(ch0, ch0.length);
    for (let c = 1; c < out.length; c++) out[c].set(ch0);
    let i = 0;
    while (i < ch0.length) {
      const take = Math.min(ch0.length - i, BLOCK - this.fill);
      this.buf.set(ch0.subarray(i, i + take), this.fill);
      this.fill += take;
      i += take;
      if (this.fill === BLOCK) {
        const b = this.buf;
        this.port.postMessage(b, [b.buffer]);
        this.buf = new Float32Array(BLOCK);
        this.fill = 0;
      }
    }
    return true;
  }
}

registerProcessor('wavelab-demo', DemoProcessor);
