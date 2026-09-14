import type { DisplayFrame } from '../engine/scopeEngine';
import { drawScope, makeEnvelope } from './scopeRenderer';
import { formatTime } from './scopeRenderer';

/**
 * Render the given frame (normally a frozen capture) into a standalone PNG
 * with a header that names the source, sample rate and scale settings.
 */
export async function renderScopePng(frame: DisplayFrame, captureTime: string): Promise<Blob> {
  const width = 1200;
  const height = 640;
  const header = 64;
  const canvas = document.createElement('canvas');
  const dpr = 2;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is not available');
  ctx.scale(dpr, dpr);
  ctx.fillStyle = '#07100f';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#d2ebe6';
  ctx.font = 'bold 18px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText(`Wave Lab — ${frame.sourceLabel}`, 16, 12);
  ctx.font = '13px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = 'rgba(210,235,230,0.75)';
  const trig = frame.trigger.mode === 'free' ? 'free-running' : `${frame.trigger.mode} edge at ${frame.trigger.level.toFixed(2)}`;
  ctx.fillText(
    `${frame.sampleRate} Hz sample rate · ${formatTime(frame.timePerDiv)}/div · gain ×${frame.gain} (±${(1 / frame.gain).toPrecision(2)} full scale) · trigger: ${trig} · ${frame.frozen ? 'frozen' : 'live'} · ${captureTime}`,
    16,
    38,
  );
  ctx.fillText('Amplitude: normalized digital full scale (uncalibrated, not volts)', width - 16 - ctx.measureText('Amplitude: normalized digital full scale (uncalibrated, not volts)').width, 12);
  ctx.save();
  ctx.translate(0, header);
  drawScope(ctx, frame, width, height - header, makeEnvelope(width), makeEnvelope(width), { showLabels: true });
  ctx.restore();
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png');
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
