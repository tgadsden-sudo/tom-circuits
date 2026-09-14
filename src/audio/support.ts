export interface AudioSupport {
  audioContext: boolean;
  audioWorklet: boolean;
  getUserMedia: boolean;
  secureContext: boolean;
  embedded: boolean;
  /** null when the browser cannot tell us; false when the embedding page's permissions policy blocks the mic. */
  microphonePolicyAllowed: boolean | null;
}

export function detectAudioSupport(): AudioSupport {
  const w = typeof window !== 'undefined' ? window : undefined;
  const AC = w && ((w as unknown as { AudioContext?: unknown }).AudioContext || (w as unknown as { webkitAudioContext?: unknown }).webkitAudioContext);
  const audioContext = !!AC;
  let audioWorklet = false;
  try {
    audioWorklet = audioContext && typeof (AudioWorkletNode as unknown) !== 'undefined' && 'audioWorklet' in (AC as { prototype: object }).prototype;
  } catch {
    audioWorklet = false;
  }
  const getUserMedia = !!(w && navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function');
  const secureContext = !!(w && window.isSecureContext);
  let embedded = false;
  try {
    embedded = !!w && window.self !== window.top;
  } catch {
    embedded = true;
  }
  let microphonePolicyAllowed: boolean | null = null;
  try {
    const fp = (document as unknown as { featurePolicy?: { allowsFeature(f: string): boolean } }).featurePolicy;
    if (fp && typeof fp.allowsFeature === 'function') microphonePolicyAllowed = fp.allowsFeature('microphone');
  } catch {
    microphonePolicyAllowed = null;
  }
  return { audioContext, audioWorklet, getUserMedia, secureContext, embedded, microphonePolicyAllowed };
}
