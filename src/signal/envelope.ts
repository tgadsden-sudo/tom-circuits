/**
 * Min/max envelope downsampling. When more than ~2 samples map onto one
 * horizontal pixel, drawing a single sample per pixel would drop short peaks.
 * Instead each pixel column records the min and max of its samples.
 */
export interface Envelope {
  /** Number of columns filled. */
  columns: number;
  min: Float32Array;
  max: Float32Array;
}

export function computeEnvelope(
  samples: Float32Array,
  start: number,
  length: number,
  columns: number,
  out: Envelope,
): Envelope {
  const cols = Math.min(columns, out.min.length);
  for (let c = 0; c < cols; c++) {
    const s0 = start + Math.floor((c * length) / cols);
    const s1 = Math.max(s0 + 1, start + Math.floor(((c + 1) * length) / cols));
    let mn = Infinity;
    let mx = -Infinity;
    for (let i = s0; i < s1 && i < samples.length; i++) {
      const v = samples[i];
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    if (!Number.isFinite(mn)) {
      mn = 0;
      mx = 0;
    }
    out.min[c] = mn;
    out.max[c] = mx;
  }
  out.columns = cols;
  return out;
}

export function makeEnvelope(maxColumns: number): Envelope {
  return { columns: 0, min: new Float32Array(maxColumns), max: new Float32Array(maxColumns) };
}
