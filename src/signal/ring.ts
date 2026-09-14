/**
 * Fixed-capacity ring buffer of Float32 samples. Memory is bounded at
 * construction; writes overwrite the oldest samples.
 */
export class RingBuffer {
  readonly capacity: number;
  private readonly data: Float32Array;
  private writePos = 0;
  /** Total samples ever written (monotonic). */
  private total = 0;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.data = new Float32Array(capacity);
  }

  get length(): number {
    return Math.min(this.total, this.capacity);
  }

  get totalWritten(): number {
    return this.total;
  }

  clear(): void {
    this.data.fill(0);
    this.writePos = 0;
    this.total = 0;
  }

  push(block: Float32Array): void {
    const n = block.length;
    if (n >= this.capacity) {
      this.data.set(block.subarray(n - this.capacity));
      this.writePos = 0;
      this.total += n;
      return;
    }
    const first = Math.min(n, this.capacity - this.writePos);
    this.data.set(block.subarray(0, first), this.writePos);
    if (first < n) this.data.set(block.subarray(first), 0);
    this.writePos = (this.writePos + n) % this.capacity;
    this.total += n;
  }

  /**
   * Copy the most recent `count` samples (oldest first) into `out`.
   * If fewer samples exist, the start of `out` is zero-filled and the
   * available samples are right-aligned. Returns the number of real samples.
   */
  latest(count: number, out: Float32Array): number {
    const avail = Math.min(count, this.length);
    const pad = count - avail;
    if (pad > 0) out.fill(0, 0, pad);
    // start index of the newest `avail` samples
    let start = (this.writePos - avail) % this.capacity;
    if (start < 0) start += this.capacity;
    const first = Math.min(avail, this.capacity - start);
    out.set(this.data.subarray(start, start + first), pad);
    if (first < avail) out.set(this.data.subarray(0, avail - first), pad + first);
    return avail;
  }

  /** Snapshot everything currently held, oldest first. */
  snapshot(): Float32Array {
    const out = new Float32Array(this.length);
    this.latest(this.length, out);
    return out;
  }
}
