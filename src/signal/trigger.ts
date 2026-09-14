import type { TriggerConfig } from './types';

export interface TriggerSearchResult {
  /** Index of the crossing sample, or -1 when none found. */
  index: number;
}

/**
 * Search `samples` for the LAST edge crossing of `level` with hysteresis such
 * that a window of `windowLength` samples starting `preTrigger` samples before
 * the crossing fits inside the array. Searching backwards means the display
 * shows the newest qualifying event.
 *
 * Rising: signal must first go below (level - hyst) then cross above level.
 * Falling: signal must first go above (level + hyst) then cross below level.
 */
export function findTrigger(
  samples: Float32Array,
  cfg: TriggerConfig,
  windowLength: number,
  preTrigger: number,
): TriggerSearchResult {
  if (cfg.mode === 'free') return { index: -1 };
  const n = samples.length;
  const lastStart = n - windowLength; // window start must be <= lastStart
  const lastCross = lastStart + preTrigger;
  const firstCross = preTrigger;
  if (lastCross < firstCross + 1) return { index: -1 };
  const h = Math.max(0, cfg.hysteresis);
  const rising = cfg.mode === 'rising';
  // Scan backwards: find a crossing at i (samples[i-1] on one side, samples[i]
  // on the other) and confirm the signal was armed (beyond the hysteresis band)
  // at some point before it since its previous crossing.
  for (let i = lastCross; i >= firstCross + 1; i--) {
    const a = samples[i - 1];
    const b = samples[i];
    const crosses = rising ? a < cfg.level && b >= cfg.level : a > cfg.level && b <= cfg.level;
    if (!crosses) continue;
    // Verify arming: walk back until we find the signal beyond the band, or
    // hit the opposite crossing (meaning it never left the band → noise).
    let armed = h === 0;
    for (let j = i - 1; j >= 0 && !armed; j--) {
      const v = samples[j];
      if (rising) {
        if (v <= cfg.level - h) armed = true;
        else if (v > cfg.level) break;
      } else {
        if (v >= cfg.level + h) armed = true;
        else if (v < cfg.level) break;
      }
    }
    if (armed) return { index: i };
  }
  return { index: -1 };
}
