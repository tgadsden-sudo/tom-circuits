import type { LiveDevice } from './liveInput';

/**
 * Heuristic classification of an audio-input device label. Browsers expose
 * only a free-text label (and only after permission), so this can never
 * prove which physical adapter is attached — it only recognises *likely*
 * external USB interfaces versus built-in microphones.
 */
export type DeviceClass = 'external' | 'builtin' | 'unknown';

const EXTERNAL = /usb|sabrent|audio adapter|audio device|sound card|interface|line[ -]?in|external|headset|codec|c-media|cm10\d|dongle|dac|adc|au-ucma|ucma/i;
const BUILTIN = /built[ -]?in|internal|iphone|ipad|macbook|imac|mac mini|realtek|intel|conexant|array/i;

export function classifyInputLabel(label: string | undefined | null): DeviceClass {
  const l = (label ?? '').trim();
  if (!l) return 'unknown';
  if (EXTERNAL.test(l)) return 'external';
  if (BUILTIN.test(l)) return 'builtin';
  return 'unknown';
}

/** Choose the most likely external adapter from a device list, or null. */
export function pickPreferredExternal(devices: LiveDevice[]): LiveDevice | null {
  const externals = devices.filter((d) => classifyInputLabel(d.label) === 'external');
  if (externals.length === 0) return null;
  // Prefer a label that names the purchased adapter, then any USB device.
  return externals.find((d) => /sabrent|ucma/i.test(d.label)) ?? externals.find((d) => /usb/i.test(d.label)) ?? externals[0];
}

export type SourceIdentity = 'recognised-external' | 'builtin' | 'unverified';

export interface IdentityResult {
  identity: SourceIdentity;
  /** Short badge text. */
  label: string;
  /** One-sentence explanation for diagnostics. */
  reason: string;
}

export const UNVERIFIED_LABEL = 'System-selected input — external adapter not confirmed';

/**
 * Decide how to describe the active input. `trackLabel` is what the
 * MediaStreamTrack reports; `listedLabel` is the enumerateDevices label for
 * the same deviceId (they can differ, and either may be empty on iOS).
 */
export function describeIdentity(trackLabel: string, listedLabel: string, deviceCount: number): IdentityResult {
  const label = trackLabel || listedLabel;
  const cls = classifyInputLabel(label) === 'unknown' ? classifyInputLabel(listedLabel) : classifyInputLabel(label);
  if (cls === 'external') {
    return {
      identity: 'recognised-external',
      label,
      reason: `The browser labels this input "${label}", which looks like a USB/external audio device. The browser cannot confirm the exact model.`,
    };
  }
  if (cls === 'builtin') {
    return {
      identity: 'builtin',
      label: `${label} (built-in, not the adapter)`,
      reason: `The browser labels this input "${label}", which looks like a built-in microphone, not an external adapter.`,
    };
  }
  return {
    identity: 'unverified',
    label: UNVERIFIED_LABEL,
    reason: label
      ? `The browser labels this input "${label}", which does not identify it as an external adapter.`
      : deviceCount <= 1
        ? 'The browser exposed only a default input without a label, so the external adapter cannot be confirmed.'
        : 'The browser did not label this input, so the external adapter cannot be confirmed.',
  };
}
