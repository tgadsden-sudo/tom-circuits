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
| Direct electrical audio capture via the **Sabrent AU-UCMA** | △ Conditional | The adapter (pink/purple mic socket), a lead, suitable input conditioning, iPhone + Safari |
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

## 3. Direct electrical audio capture — Sabrent AU-UCMA (conditional)

The purchased interface is the **Sabrent AU-UCMA** USB-C audio adapter. From the manufacturer and
retailer descriptions that could be read (search snippets only; the product page itself was not
reachable from the build environment): a USB-C plug-and-play, bus-powered adapter with a **separate
pink/purple 3.5 mm microphone input (mono)** and a **separate green 3.5 mm headphone output
(stereo)**, advertised at 16/24-bit up to 96 kHz. **No input sensitivity, maximum input level or
voltage rating was found** in that material, so none is assumed here.

Intended signal path:

```
BrainBox measurement points
  → appropriate input conditioning where required
  → existing crocodile-clip (red/black) to 3.5 mm TRS lead   [internal wiring NOT verified]
  → Sabrent pink/purple MICROPHONE socket                    [never the green headphone socket]
  → USB-C iPhone
  → Wave Lab in Safari (HTTPS)
```

**Use the kit's verified oscilloscope wiring and suitable input conditioning. This microphone input
is not a general-purpose voltage probe.**

Points that remain open:

* **Input conditioning.** The adapter's microphone input is designed for microphone-level signals.
  What attenuation, coupling or protection is needed between the BrainBox and the lead is
  unverified; this document does not propose component values.
* **The lead.** The existing lead has red/black crocodile clips and a three-contact TRS plug. Its
  internal wiring (which clip goes to tip, ring or sleeve) has not been verified. Because the Sabrent
  has a dedicated microphone socket, a smartphone TRRS splitter or a RØDE SC4-type adapter is *not*
  automatically required; whether the TRS lead is wired appropriately for a mono microphone input is
  still to be checked.
* **Supply voltage is not a signal rating.** The kit typically runs from two AA cells, about 3 V
  nominal. That is the circuit supply, not a verified signal amplitude and not an adapter input
  rating.
* **Bit depth and sample rate.** The advertised 24-bit/96 kHz is what the adapter can do, not what
  Safari will negotiate. Wave Lab shows the sample rate and sample size the browser actually reports,
  and analyses at the AudioContext rate.
* **Hardware compatibility of the Sabrent + iPhone + Safari combination has not been tested** by the
  author; iOS may expose the adapter only as an unlabelled default input, which Wave Lab reports as
  "System-selected input — external adapter not confirmed".

General conditions that still apply to any interface:

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
unknown outputs. Software gain cannot protect the physical input or undo clipping that occurred
before digitisation; the app's clipping indicator is advisory, since analogue overload can occur
without samples reaching digital full scale. The **exact BrainBox connection requirements remain unverified**: no manufacturer
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
