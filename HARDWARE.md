# Hardware and connection guide

Wave Lab is an **audio-bandwidth, uncalibrated** instrument that lives inside a web browser. What it
can observe depends entirely on what audio input the device and browser expose. This document
explains which set-ups are supported, which are conditional, and which are out of scope.

> ⚠ **Do not connect battery, motor or speaker terminals directly to a phone or computer audio
> socket.**

## Summary

| Set-up | Support | Equipment |
| --- | --- | --- |
| Demo mode | ✓ Supported | None |
| Acoustic experiments | ✓ Supported | Device microphone + the kit's speaker |
| Direct electrical audio capture | △ Conditional | A verified, protected/attenuated audio interface, proper leads, a real audio input |
| DC, calibrated voltage, non-audio bandwidth | ✕ Not supported | A real oscilloscope or DAQ with probes |

## 1. Demo mode — no extra equipment

The demo generator produces sine, square, triangle, sawtooth, white-noise and siren signals in
software. They flow through the same display and measurement pipeline as live audio. Demo controls
change **only the simulation**; they have no effect on a physical BrainBox kit.

## 2. Acoustic experiments — microphone and the kit's speaker

Needs:

* A working microphone on the phone, tablet or computer.
* The BrainBox speaker, driven by a sound-producing circuit built from the **kit's own manual**.

There is **no electrical cable** between the kit and the device. Hold the device's microphone a few
centimetres from the speaker. This is safe for both the kit and the device.

Limits to be aware of:

* You observe the sound **after** the speaker, the air, the room and the microphone have altered
  it. It is not the electrical waveform inside the circuit. Shapes will look different from what a
  wired oscilloscope would show, and low frequencies in particular are attenuated by small speakers
  and microphones.
* Phones and laptops often apply automatic gain control, noise suppression and echo cancellation to
  microphone audio. Wave Lab asks the browser to turn these off, but the browser or operating system
  may still process the audio. Loudness comparisons are therefore approximate.
* Amplitude readings are normalized digital values, not sound-pressure levels.

## 3. Direct electrical audio capture — conditional

Wave Lab can display whatever an audio-input device delivers to the browser (through
`getUserMedia`). Feeding a circuit signal into such an input is only acceptable when **all** of the
following are in place:

* A **verified, suitable, protected and attenuated interface** designed for connecting external
  signals to an audio input (input protection, attenuation and AC coupling appropriate for the
  signals involved).
* **Appropriate leads** for that interface.
* An **audio input the device actually exposes** to the browser. Many phones and laptops have no
  line input at all; a headset socket is typically designed for a microphone capsule, not for
  arbitrary signals.

Things that are *not* sufficient:

* A generic USB sound adapter is not, by itself, a protected oscilloscope input.
* A headphone adapter may be **output-only**.
* Connector shape alone does not establish electrical compatibility.
* A "low-voltage" kit is **not** automatically safe for an audio input: audio inputs are designed for
  millivolt-level microphone signals or roughly ±1 V line signals, and a battery, motor or speaker
  circuit can exceed that or present DC.

Wave Lab deliberately does **not** give resistor values, probe wiring or instructions for connecting
unknown outputs. The **exact BrainBox connection requirements remain unverified**: no manufacturer
documentation describing the original programme's cable, input or protection circuitry was found
(see [RESEARCH.md](RESEARCH.md)). If you locate the original manual or instructions, follow those,
and treat everything in this section as general engineering guidance rather than verified
instructions for the kit.

Even with a suitable interface, Wave Lab still shows **normalized amplitude, not volts**. There is
no calibration path from an audio interface's digital output to a voltage.

## 4. DC, calibrated voltage, or signals outside audio bandwidth — not supported

Audio inputs are AC-coupled (they block DC) and roll off outside roughly 20 Hz–20 kHz. Measuring a
steady battery voltage, a slowly changing sensor, a motor's current, a radio-frequency signal or any
*calibrated* voltage requires a real oscilloscope or data-acquisition device with appropriate probes.
Those instruments are not automatically supported by this app; it only understands audio input
devices the browser exposes.

## What Wave Lab can and cannot claim

* It **can** show the shape, frequency and relative loudness of audio-band signals.
* It **cannot** measure volts, amperes, watts, dB SPL, DC levels or anything above the Nyquist
  frequency of the audio device.
* All readings are in normalized digital units (full scale = 1.0) or dBFS.
