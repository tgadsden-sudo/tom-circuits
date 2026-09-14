import type { Capture, TriggerConfig } from './types';

/**
 * CSV format (documented in README):
 *   Lines starting with '#' are metadata, "key: value".
 *   Then a header row `time_s,amplitude` followed by one row per sample.
 *   time_s is seconds relative to the start of the displayed window
 *   (t = 0 at the first exported sample). amplitude is normalized full-scale
 *   (-1..+1), NOT volts.
 */
export function captureToCsv(capture: Capture, trigger: TriggerConfig, extra: Record<string, string> = {}): string {
  const { samples, sampleRate, windowStart, windowLength, triggerIndex, meta } = capture;
  const lines: string[] = [];
  lines.push('# Wave Lab capture');
  lines.push(`# source: ${meta.source}`);
  lines.push(`# source_label: ${meta.sourceLabel.replace(/[\r\n]+/g, ' ')}`);
  lines.push(`# sample_rate_hz: ${sampleRate}`);
  lines.push(`# captured_at: ${meta.capturedAt}`);
  lines.push(`# samples: ${windowLength}`);
  lines.push(`# duration_s: ${(windowLength / sampleRate).toPrecision(6)}`);
  lines.push(`# trigger_mode: ${trigger.mode}`);
  if (trigger.mode !== 'free') lines.push(`# trigger_level: ${trigger.level}`);
  lines.push(`# trigger_sample_index: ${triggerIndex >= 0 ? triggerIndex - windowStart : 'none'}`);
  lines.push('# amplitude_units: normalized digital full scale (-1..+1), uncalibrated, not volts');
  for (const n of meta.notes) lines.push(`# note: ${n.replace(/[\r\n]+/g, ' ')}`);
  for (const [k, v] of Object.entries(extra)) lines.push(`# ${k}: ${v}`);
  lines.push('time_s,amplitude');
  const end = Math.min(samples.length, windowStart + windowLength);
  for (let i = windowStart; i < end; i++) {
    const t = (i - windowStart) / sampleRate;
    lines.push(`${t.toFixed(9)},${samples[i].toFixed(6)}`);
  }
  return lines.join('\n') + '\n';
}
