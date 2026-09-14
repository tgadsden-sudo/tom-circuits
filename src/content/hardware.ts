export interface HardwareMode {
  title: string;
  needs: string[];
  notes: string[];
  supported: 'yes' | 'conditional' | 'no';
}

export const SAFETY_WARNING =
  'Do not connect battery, motor or speaker terminals directly to a phone or computer audio socket.';

export const HARDWARE_MODES: HardwareMode[] = [
  {
    title: 'Demo mode',
    supported: 'yes',
    needs: ['Nothing extra. Works offline once the page has loaded.'],
    notes: ['Signals are simulated in software. Demo controls change the simulation only; they do not control the BrainBox kit.'],
  },
  {
    title: 'Acoustic experiments',
    supported: 'yes',
    needs: ['A working microphone on the phone, tablet or computer.', 'The kit\'s speaker, driven by a circuit built from the kit\'s own manual.'],
    notes: ['No electrical cable between the kit and the device.', 'You observe the sound after the speaker, the air and the microphone have altered it, not the original electrical waveform.'],
  },
  {
    title: 'Direct electrical audio capture',
    supported: 'conditional',
    needs: [
      'A verified, suitable protected/attenuated audio interface designed for this purpose.',
      'Appropriate leads for that interface.',
      'An audio input that the device and browser actually expose (many phones and laptops have no line input).',
    ],
    notes: [
      'Exact BrainBox connection requirements are unverified; no original documentation describing the cable or protection was found.',
      'A generic USB sound adapter is not, by itself, a protected oscilloscope input.',
      'A headphone adapter may be output-only. Connector shape alone does not establish electrical compatibility.',
      'Even a low-voltage kit can damage an audio input.',
      'Wave Lab shows normalized amplitude, not volts, even in this mode.',
    ],
  },
  {
    title: 'DC, calibrated voltage, or signals outside audio bandwidth',
    supported: 'no',
    needs: ['A real oscilloscope or data-acquisition device with suitable probes.'],
    notes: ['Audio inputs block DC and roll off outside roughly 20 Hz–20 kHz. Those instruments are not automatically supported by this app.'],
  },
];
