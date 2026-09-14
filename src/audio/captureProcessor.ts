/**
 * AudioWorklet processor that forwards channel 0 of its input to the main
 * thread in fixed-size blocks. It outputs silence, so nothing is ever routed
 * to the speakers even though the node must be connected to the destination
 * for the graph to run.
 */
const BLOCK = 2048;

class CaptureProcessor extends AudioWorkletProcessor {
  private buf = new Float32Array(BLOCK);
  private fill = 0;

  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0];
    if (input && input[0]) {
      const ch = input[0];
      let i = 0;
      while (i < ch.length) {
        const take = Math.min(ch.length - i, BLOCK - this.fill);
        this.buf.set(ch.subarray(i, i + take), this.fill);
        this.fill += take;
        i += take;
        if (this.fill === BLOCK) {
          const out = this.buf;
          this.port.postMessage(out, [out.buffer]);
          this.buf = new Float32Array(BLOCK);
          this.fill = 0;
        }
      }
    }
    return true;
  }
}

registerProcessor('wavelab-capture', CaptureProcessor);
