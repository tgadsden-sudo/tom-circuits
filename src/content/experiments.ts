import type { DemoParams } from '../signal/types';

export interface Experiment {
  id: string;
  title: string;
  action: string;
  lookFor: string;
  why: string;
  /** Settings to apply when the user presses "Set up". Never switches to live input. */
  setup?: {
    demo?: Partial<DemoParams>;
    timePerDiv?: number;
    gain?: number;
    triggerMode?: 'free' | 'rising' | 'falling';
    /** Which source tab to show. Live tabs are shown but never auto-connected. */
    showSource?: 'demo' | 'microphone';
    view?: 'waveform' | 'spectrum';
  };
  buttonLabel: string;
}

export const EXPERIMENTS: Experiment[] = [
  {
    id: 'hum',
    title: '1. Hum a low note, then a high note',
    action: 'Switch to Microphone, press Connect and allow access. Hum a low note steadily, then a higher one.',
    lookFor: 'The waves get closer together for the high note. The frequency reading goes up and the period gets shorter.',
    why: 'Frequency is how many wave cycles happen each second. A higher note vibrates the air more times per second, so more cycles fit in the same time window.',
    setup: { showSource: 'microphone', timePerDiv: 0.002, gain: 2, triggerMode: 'rising', view: 'waveform' },
    buttonLabel: 'Set up scope (then Connect yourself)',
  },
  {
    id: 'loud',
    title: '2. Quiet sound, then louder sound',
    action: 'With the microphone connected, keep the same distance and make a quiet "aaah", then a louder one.',
    lookFor: 'The wave grows taller. Watch RMS and peak-to-peak rise. If the input clipping warning appears, the microphone is overloaded.',
    why: 'Amplitude is the size of the vibration. Many phones and laptops apply automatic gain or noise processing to the microphone, so the change on screen may be smaller than what you hear. Wave Lab asks the browser to switch that off, but it cannot force it.',
    setup: { showSource: 'microphone', timePerDiv: 0.005, gain: 1, triggerMode: 'rising', view: 'waveform' },
    buttonLabel: 'Set up scope (then Connect yourself)',
  },
  {
    id: 'shapes',
    title: '3. Compare sine, square and triangle',
    action: 'In Demo mode, switch between sine, square and triangle at the same frequency. Look at the waveform and the spectrum.',
    lookFor: 'The sine has a single spectrum peak. Square and triangle waves show extra peaks (harmonics) at 3×, 5×, 7×… the frequency, stronger for the square wave.',
    why: 'Any repeating shape can be built from sine waves. Sharper corners need more, stronger high-frequency sine waves. The tiny ripples on the square wave edges are real: this square wave is band-limited to the harmonics the sample rate can hold.',
    setup: { demo: { waveform: 'square', frequency: 300, amplitude: 0.6, dutyCycle: 0.5 }, timePerDiv: 0.001, gain: 1, triggerMode: 'rising', showSource: 'demo', view: 'spectrum' },
    buttonLabel: 'Set up demo square wave',
  },
  {
    id: 'siren',
    title: '4. Follow a siren',
    action: 'Select the siren demo. Watch the waveform and the spectrum peak move.',
    lookFor: 'The wave spacing squeezes and stretches as the pitch rises and falls. The frequency readout reports "unstable" while the pitch is changing, which is correct: there is no single frequency.',
    why: 'A siren is a frequency that changes with time. The spectrum shows where the energy is right now; the waveform shows the cycles getting shorter and longer.',
    setup: { demo: { waveform: 'siren', sirenLow: 400, sirenHigh: 1200, sirenRate: 0.5, amplitude: 0.6 }, timePerDiv: 0.002, gain: 1, triggerMode: 'rising', showSource: 'demo', view: 'waveform' },
    buttonLabel: 'Set up siren demo',
  },
  {
    id: 'brainbox',
    title: '5. Listen to the BrainBox speaker',
    action: 'Using the kit\'s own manual, build any circuit that makes a sound through the speaker. Switch to Microphone, connect, and hold the device microphone a few centimetres from the speaker.',
    lookFor: 'A steady tone shows a repeating wave and a frequency reading. Change the circuit (as the manual suggests) and watch the shape, frequency or loudness change.',
    why: 'What you see is the sound after it has travelled through air into the microphone, not the electrical signal inside the circuit. That is still a good way to compare tones. Do not connect any wires from the kit to your phone or computer.',
    setup: { showSource: 'microphone', timePerDiv: 0.002, gain: 2, triggerMode: 'rising', view: 'waveform' },
    buttonLabel: 'Set up scope (then Connect yourself)',
  },
];
