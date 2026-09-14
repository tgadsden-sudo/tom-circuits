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
    title: 'Direct electrical audio capture — Sabrent AU-UCMA USB-C adapter',
    supported: 'conditional',
    needs: [
      'Sabrent AU-UCMA (USB-C; separate pink/purple 3.5 mm microphone socket and green 3.5 mm headphone socket). Use the pink/purple socket only — the green socket is an output.',
      'Appropriate input conditioning between the circuit and the lead where required (the safe input range of the adapter\'s microphone socket is not published in the material found; do not assume one).',
      'A lead to the adapter — the existing red/black crocodile-clip lead with a three-contact TRS plug has NOT had its internal wiring verified.',
      'iPhone with USB-C, Wave Lab opened directly in Safari over HTTPS.',
    ],
    notes: [
      'Use the kit\'s verified oscilloscope wiring and suitable input conditioning. This microphone input is not a general-purpose voltage probe.',
      'The kit runs from two AA cells (about 3 V nominal). That is the supply voltage, not a verified signal amplitude and not an adapter input rating.',
      'The adapter\'s microphone input is mono and designed for microphone-level signals; the advertised 24-bit/96 kHz is not guaranteed by what Safari negotiates. Wave Lab reports what the browser actually exposes.',
      'Software gain cannot protect the input or undo clipping that happened before digitisation. Clipping detection is advisory.',
      'The audio path is AC-coupled: it shows changing audio-frequency signals, not steady DC, and does not preserve absolute circuit voltage.',
      'Exact BrainBox connection requirements remain unverified; no original documentation describing the cable or protection was found.',
      'Wave Lab shows normalized amplitude, not volts, in every mode.',
    ],
  },
  {
    title: 'DC, calibrated voltage, or signals outside audio bandwidth',
    supported: 'no',
    needs: ['A real oscilloscope or data-acquisition device with suitable probes.'],
    notes: ['Audio inputs block DC and roll off outside roughly 20 Hz–20 kHz. Those instruments are not automatically supported by this app.'],
  },
];
