import captureWorkletUrl from './captureProcessor.ts?worker&url';
import demoWorkletUrl from './demoProcessor.ts?worker&url';

/**
 * A single shared AudioContext for the whole app. Created lazily on a user
 * gesture; worklet modules are added once. Repeated mode switches reuse it,
 * so there is never more than one context or duplicate module registration.
 */
let ctx: AudioContext | null = null;
let workletsLoaded: Promise<void> | null = null;

export function getExistingContext(): AudioContext | null {
  return ctx;
}

export async function getAudioContext(): Promise<AudioContext> {
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) throw new Error('Web Audio is not available in this browser.');
    ctx = new AC({ latencyHint: 'interactive' });
  }
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      /* stays suspended; UI shows a resume button */
    }
  }
  return ctx;
}

export async function ensureWorklets(context: AudioContext): Promise<void> {
  if (!workletsLoaded) {
    if (!context.audioWorklet) throw new Error('AudioWorklet is not supported in this browser.');
    workletsLoaded = Promise.all([
      context.audioWorklet.addModule(captureWorkletUrl),
      context.audioWorklet.addModule(demoWorkletUrl),
    ]).then(() => undefined);
    workletsLoaded.catch(() => {
      workletsLoaded = null;
    });
  }
  return workletsLoaded;
}

/** Close the shared context (used on page unload). */
export async function closeAudioContext(): Promise<void> {
  if (ctx) {
    const c = ctx;
    ctx = null;
    workletsLoaded = null;
    try {
      await c.close();
    } catch {
      /* ignore */
    }
  }
}
