import { computeEnvelope, makeEnvelope, type Envelope } from '../signal/envelope';
import { H_DIVISIONS, V_DIVISIONS, type DisplayFrame } from '../engine/scopeEngine';

export const COLORS = {
  bg: '#07100f',
  grid: 'rgba(120, 200, 190, 0.16)',
  gridMajor: 'rgba(120, 200, 190, 0.32)',
  trace: '#33f2c8',
  traceDim: 'rgba(51, 242, 200, 0.55)',
  reference: 'rgba(255, 196, 80, 0.75)',
  triggerLine: 'rgba(255, 120, 120, 0.85)',
  text: 'rgba(210, 235, 230, 0.9)',
  textDim: 'rgba(210, 235, 230, 0.6)',
  clip: '#ff5a5a',
};

export interface PlotLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}

const FONT = '12px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export function formatTime(seconds: number): string {
  const a = Math.abs(seconds);
  if (a === 0) return '0';
  if (a < 1e-3) return `${(seconds * 1e6).toFixed(0)} µs`;
  if (a < 1) return `${trimZeros((seconds * 1e3).toFixed(2))} ms`;
  return `${trimZeros(seconds.toFixed(3))} s`;
}
function trimZeros(s: string): string {
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}
export function formatAmp(v: number): string {
  if (Math.abs(v) >= 1) return v.toFixed(2);
  return trimZeros(v.toFixed(3));
}

/**
 * Draw grid, trace, reference and labels into `ctx`. `width`/`height` are in
 * CSS pixels; the caller sets the DPR transform. Returns the plot rectangle.
 */
export function drawScope(
  ctx: CanvasRenderingContext2D,
  frame: DisplayFrame,
  width: number,
  height: number,
  env: Envelope,
  refEnv: Envelope,
  opts: { showLabels?: boolean } = {},
): PlotLayout {
  const showLabels = opts.showLabels ?? true;
  const left = showLabels ? 46 : 8;
  const bottom = showLabels ? 26 : 8;
  const top = 8;
  const right = 10;
  const plot: PlotLayout = { x: left, y: top, w: Math.max(10, width - left - right), h: Math.max(10, height - top - bottom) };

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, width, height);

  // Grid
  ctx.lineWidth = 1;
  ctx.font = FONT;
  ctx.textBaseline = 'top';
  for (let i = 0; i <= H_DIVISIONS; i++) {
    const x = Math.round(plot.x + (i / H_DIVISIONS) * plot.w) + 0.5;
    ctx.strokeStyle = i === 0 || i === H_DIVISIONS ? COLORS.gridMajor : COLORS.grid;
    ctx.beginPath();
    ctx.moveTo(x, plot.y);
    ctx.lineTo(x, plot.y + plot.h);
    ctx.stroke();
  }
  for (let i = 0; i <= V_DIVISIONS; i++) {
    const y = Math.round(plot.y + (i / V_DIVISIONS) * plot.h) + 0.5;
    ctx.strokeStyle = i === V_DIVISIONS / 2 || i === 0 || i === V_DIVISIONS ? COLORS.gridMajor : COLORS.grid;
    ctx.beginPath();
    ctx.moveTo(plot.x, y);
    ctx.lineTo(plot.x + plot.w, y);
    ctx.stroke();
  }

  const fullScale = 1 / frame.gain; // amplitude at the top edge
  const unitsPerDiv = (2 * fullScale) / V_DIVISIONS;
  const windowSeconds = frame.timePerDiv * H_DIVISIONS;
  const t0 = frame.triggerIndex >= 0 ? -(frame.triggerIndex - frame.start) / frame.sampleRate : 0;

  if (showLabels) {
    ctx.fillStyle = COLORS.textDim;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= V_DIVISIONS; i += 2) {
      const v = fullScale - i * unitsPerDiv;
      const y = plot.y + (i / V_DIVISIONS) * plot.h;
      ctx.fillText(formatAmp(v), plot.x - 6, y);
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let i = 0; i <= H_DIVISIONS; i += 2) {
      const t = t0 + (i / H_DIVISIONS) * windowSeconds;
      const x = plot.x + (i / H_DIVISIONS) * plot.w;
      ctx.textAlign = i === 0 ? 'left' : i === H_DIVISIONS ? 'right' : 'center';
      ctx.fillText(formatTime(t), x, plot.y + plot.h + 6);
    }
  }

  const toY = (v: number) => plot.y + ((fullScale - v) / (2 * fullScale)) * plot.h;

  // Trigger level line
  if (frame.trigger.mode !== 'free') {
    const y = toY(frame.trigger.level);
    if (y >= plot.y && y <= plot.y + plot.h) {
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = COLORS.triggerLine;
      ctx.beginPath();
      ctx.moveTo(plot.x, Math.round(y) + 0.5);
      ctx.lineTo(plot.x + plot.w, Math.round(y) + 0.5);
      ctx.stroke();
      ctx.restore();
    }
    if (frame.triggerIndex >= 0) {
      const tx = plot.x + ((frame.triggerIndex - frame.start) / frame.length) * plot.w;
      ctx.fillStyle = COLORS.triggerLine;
      ctx.beginPath();
      ctx.moveTo(tx - 5, plot.y);
      ctx.lineTo(tx + 5, plot.y);
      ctx.lineTo(tx, plot.y + 7);
      ctx.closePath();
      ctx.fill();
    }
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(plot.x, plot.y, plot.w, plot.h);
  ctx.clip();

  // Reference trace (drawn first, underneath)
  if (frame.reference) {
    const r = frame.reference;
    const refLen = Math.min(r.windowLength, Math.round(windowSeconds * r.sampleRate));
    drawTrace(ctx, r.samples, r.windowStart, refLen, plot, toY, refEnv, COLORS.reference, 1);
  }

  let displayClipped = false;
  if (frame.length > 0) {
    const untriggered = frame.triggerState === 'no-crossing' || (frame.triggerState === 'armed' && frame.triggerIndex < 0);
    displayClipped = drawTrace(ctx, frame.samples, frame.start, frame.length, plot, toY, env, untriggered ? COLORS.traceDim : COLORS.trace, untriggered ? 1.2 : 1.6);
  }
  ctx.restore();

  // Display-clipping markers: trace leaves the plot because of gain (not input clipping)
  if (displayClipped) {
    ctx.fillStyle = COLORS.textDim;
    ctx.font = FONT;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText('trace beyond display — lower gain', plot.x + plot.w - 6, plot.y + 4);
  }
  if (frame.inputClipping) {
    ctx.fillStyle = COLORS.clip;
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('▲ INPUT CLIPPING', plot.x + 6, plot.y + 4);
  }
  return plot;
}

/** Returns true when any drawn sample fell outside the plot vertically. */
function drawTrace(
  ctx: CanvasRenderingContext2D,
  samples: Float32Array,
  start: number,
  length: number,
  plot: PlotLayout,
  toY: (v: number) => number,
  env: Envelope,
  color: string,
  lineWidth: number,
): boolean {
  const cols = Math.max(1, Math.floor(plot.w));
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = 'round';
  let clipped = false;
  const top = plot.y;
  const bot = plot.y + plot.h;
  if (length > cols * 2) {
    // Min/max envelope: each pixel column shows the full range of its samples.
    computeEnvelope(samples, start, length, cols, env);
    ctx.beginPath();
    for (let c = 0; c < env.columns; c++) {
      const x = plot.x + c + 0.5;
      const yMax = toY(env.max[c]);
      const yMin = toY(env.min[c]);
      if (yMax < top || yMin > bot) clipped = true;
      ctx.moveTo(x, Math.min(yMax, yMin) - 0.5);
      ctx.lineTo(x, Math.max(yMax, yMin) + 0.5);
    }
    ctx.stroke();
    // Connect column means for continuity
    ctx.beginPath();
    for (let c = 0; c < env.columns; c++) {
      const x = plot.x + c + 0.5;
      const y = toY((env.max[c] + env.min[c]) / 2);
      if (c === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  } else {
    ctx.beginPath();
    const end = Math.min(samples.length, start + length);
    for (let i = start; i < end; i++) {
      const x = plot.x + ((i - start) / length) * plot.w;
      const y = toY(samples[i]);
      if (y < top || y > bot) clipped = true;
      if (i === start) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  return clipped;
}

export { makeEnvelope };
