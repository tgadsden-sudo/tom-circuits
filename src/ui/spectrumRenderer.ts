import type { SpectrumResult } from '../signal/types';
import { COLORS } from './scopeRenderer';
import { formatHz } from '../signal/generator';

export const SPECTRUM_MIN_DB = -100;
export const SPECTRUM_MAX_DB = 0;

export function drawSpectrum(
  ctx: CanvasRenderingContext2D,
  spec: SpectrumResult | null,
  width: number,
  height: number,
  maxHz: number,
): void {
  const left = 40;
  const bottom = 26;
  const top = 8;
  const right = 24;
  const px = left;
  const py = top;
  const pw = Math.max(10, width - left - right);
  const ph = Math.max(10, height - top - bottom);
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, width, height);
  ctx.font = '12px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.lineWidth = 1;

  const nyquist = spec ? spec.sampleRate / 2 : maxHz;
  const fMax = Math.min(maxHz, nyquist);

  // dB grid (every 20 dB)
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let db = SPECTRUM_MAX_DB; db >= SPECTRUM_MIN_DB; db -= 20) {
    const y = py + ((SPECTRUM_MAX_DB - db) / (SPECTRUM_MAX_DB - SPECTRUM_MIN_DB)) * ph;
    ctx.strokeStyle = db === 0 ? COLORS.gridMajor : COLORS.grid;
    ctx.beginPath();
    ctx.moveTo(px, Math.round(y) + 0.5);
    ctx.lineTo(px + pw, Math.round(y) + 0.5);
    ctx.stroke();
    ctx.fillStyle = COLORS.textDim;
    ctx.fillText(`${db}`, px - 5, y);
  }
  // Frequency grid
  const step = niceStep(fMax / 8);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let f = 0; f <= fMax + 1e-6; f += step) {
    const x = px + (f / fMax) * pw;
    ctx.strokeStyle = f === 0 ? COLORS.gridMajor : COLORS.grid;
    ctx.beginPath();
    ctx.moveTo(Math.round(x) + 0.5, py);
    ctx.lineTo(Math.round(x) + 0.5, py + ph);
    ctx.stroke();
    ctx.fillStyle = COLORS.textDim;
    ctx.textAlign = f === 0 ? 'left' : f + step > fMax + 1e-6 ? 'right' : 'center';
    ctx.fillText(f >= 1000 ? `${trim(f / 1000)}k` : `${trim(f)}`, x, py + ph + 6);
  }
  ctx.fillStyle = COLORS.textDim;
  ctx.textAlign = 'left';
  ctx.fillText('Hz', px + pw + 2, py + ph + 6);
  ctx.textAlign = 'left';
  ctx.fillText('dBFS', px + 4, py + 2);

  if (!spec) return;
  const mags = spec.magnitudesDb;
  const binMax = Math.min(mags.length - 1, Math.floor(fMax / spec.binHz));
  ctx.strokeStyle = COLORS.trace;
  ctx.fillStyle = 'rgba(51, 242, 200, 0.18)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  const cols = Math.floor(pw);
  const binsPerCol = (binMax + 1) / cols;
  ctx.moveTo(px, py + ph);
  if (binsPerCol > 1) {
    // Max-hold per pixel so narrow peaks are not lost
    for (let c = 0; c < cols; c++) {
      const b0 = Math.floor(c * binsPerCol);
      const b1 = Math.max(b0 + 1, Math.floor((c + 1) * binsPerCol));
      let m = -Infinity;
      for (let b = b0; b < b1 && b <= binMax; b++) if (mags[b] > m) m = mags[b];
      const y = py + clamp01((SPECTRUM_MAX_DB - m) / (SPECTRUM_MAX_DB - SPECTRUM_MIN_DB)) * ph;
      ctx.lineTo(px + c, y);
    }
  } else {
    for (let b = 0; b <= binMax; b++) {
      const x = px + ((b * spec.binHz) / fMax) * pw;
      const y = py + clamp01((SPECTRUM_MAX_DB - mags[b]) / (SPECTRUM_MAX_DB - SPECTRUM_MIN_DB)) * ph;
      ctx.lineTo(x, y);
    }
  }
  ctx.lineTo(px + pw, py + ph);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  if (spec.peak && spec.peak.hz <= fMax) {
    const x = px + (spec.peak.hz / fMax) * pw;
    const y = py + clamp01((SPECTRUM_MAX_DB - spec.peak.db) / (SPECTRUM_MAX_DB - SPECTRUM_MIN_DB)) * ph;
    ctx.fillStyle = COLORS.reference;
    ctx.beginPath();
    ctx.moveTo(x, y - 4);
    ctx.lineTo(x - 4, y - 10);
    ctx.lineTo(x + 4, y - 10);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = x > px + pw * 0.75 ? 'right' : 'left';
    const label = `peak ${formatHz(spec.peak.hz)}, ${spec.peak.db.toFixed(0)} dBFS`;
    const dx = x > px + pw * 0.75 ? -8 : 8;
    if (y - 10 < py + 16) {
      ctx.textBaseline = 'top';
      ctx.fillText(label, x + dx, py + 14);
    } else {
      ctx.textBaseline = 'bottom';
      ctx.fillText(label, x + dx, y - 10);
    }
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function trim(v: number): string {
  return Number.isInteger(v) ? `${v}` : `${parseFloat(v.toFixed(2))}`;
}
function niceStep(raw: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  const n = m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10;
  return n * p;
}
