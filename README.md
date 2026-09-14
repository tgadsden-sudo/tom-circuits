# Wave Lab

An educational **audio oscilloscope and spectrum viewer** that runs in the browser. It is an
independent companion for the Cambridge BrainBox Explorer 2 electronics kit, intended to help an
adult and children *see, hear and understand waveforms*. It is **not** official Cambridge BrainBox
software and does not reproduce the kit's original "Oscilloscope Programme" CD (see
[RESEARCH.md](RESEARCH.md)).

Three input modes, always visibly labelled in the header badge:

| Mode | What it shows | Needs |
| --- | --- | --- |
| **Demo signals** | Simulated sine, square, triangle, sawtooth, white noise and siren, generated as real sample buffers | Nothing; works offline once loaded |
| **Microphone** | Sound captured through the air (speech, humming, whistles, the kit's speaker) | A microphone, HTTPS or localhost, permission |
| **External audio input** | Any audio-input device the browser exposes (for example a USB audio interface) | A *verified, protected* interface before any circuit is connected; see [HARDWARE.md](HARDWARE.md) |

Live input is never silently replaced by simulated data. If a connection fails, the app says so and
shows nothing.

> ⚠ **Do not connect battery, motor or speaker terminals directly to a phone or computer audio
> socket.** Read [HARDWARE.md](HARDWARE.md) before attempting any electrical connection.

## Run it

Requirements: Node.js 20 or newer (developed with Node 22) and npm.

```bash
npm install
npm run dev        # development server, prints a http://localhost:5173 URL
npm run build      # type-checks and writes a production build to dist/
npm run preview    # serves dist/ at http://localhost:4173
```

The build is fully static (`dist/`); host it on any static web server. Relative asset paths are
used, so it works from a sub-directory. Microphone access requires the page to be served over
**HTTPS or from localhost**.

## Tests

```bash
npm test           # unit tests (vitest): generator, pitch/RMS/peak, FFT, trigger, ring buffer, CSV
npm run test:e2e   # browser tests (Playwright, Chromium) against the production build
```

The end-to-end suite starts `vite preview` itself. It includes a project that launches Chromium
with a **fake microphone device** to exercise the live-capture path; that is simulated input, not a
real microphone. If Playwright's own browser download is unavailable, point it at an installed
Chromium with `PW_CHROMIUM_PATH=/path/to/chrome npm run test:e2e`.

## Browser requirements

* A modern browser with **Web Audio + AudioWorklet** (Chrome/Edge 66+, Firefox 76+, Safari 14.1+).
  Demo mode works without them (the waveform is generated on the main thread) but audible playback
  and live input do not.
* `getUserMedia` for live input, which browsers only allow in a **secure context** (HTTPS or
  `localhost`).
* Embedded previews (iframes) frequently block the microphone through a permissions policy. If the
  permission prompt never appears, open Wave Lab in its own tab.
* Browsers and operating systems may still apply echo cancellation, noise suppression or automatic
  gain to the microphone. Wave Lab asks for them to be disabled and reports what the browser says it
  applied under *Capture details*.

## What the readings mean

* **Amplitude** is normalized digital full scale: 1.0 is the largest value the audio path can
  represent. RMS is also shown in **dBFS**. Nothing is calibrated to volts, amperes, watts or
  sound-pressure-level decibels.
* **Frequency** uses a periodicity method (McLeod's normalized square difference function) with a
  clarity threshold of 0.9. It shows `—` for silence (below −60 dBFS) or aperiodic input and
  `unstable` while successive estimates disagree by more than 4 % (for example the siren). It is not
  "the biggest FFT peak".
* **Dominant spectral peak** is the strongest component in a 4096-point Hann-windowed FFT
  (interpolated between bins). For a square wave it coincides with the fundamental; for other sounds
  it may be a harmonic.
* **Input clipping** means samples are pinned at full scale (|x| ≥ 0.985 for 3 consecutive samples).
  It is deliberately separate from the "trace beyond display" note, which only means the display
  gain is too high.
* **Sample rate** is whatever the source really runs at: the AudioContext rate for live input and
  audible playback, a nominal 48 kHz for the silent demo generator.
* **Display gain** and **time/division** change only what is drawn. The captured samples and every
  reading are unaffected.

## Demo generator

Square, triangle and sawtooth waves are synthesised **additively** from their Fourier series with
every harmonic kept below 98 % of the Nyquist frequency (up to 256 harmonics). The sampled signal is
therefore band-limited and does not alias. The small ripple visible at square-wave edges (Gibbs
phenomenon) is a genuine property of a band-limited square wave.

Audible playback is **off by default**, starts only from the *Play sound* button, begins at a low
gain (0.08) with a limit of 0.5, has a prominent *Stop sound* control, and is stopped automatically
when you switch to a live input mode so the microphone cannot feed back. While playback runs, the
same AudioWorklet produces both the audible samples and the displayed samples.

## Capture and export

*Freeze* stores a snapshot of the last 4 s of samples. You can still change time/division on the
frozen data; the window is re-positioned around the trigger point. *Single* arms a capture that
freezes on the next qualifying trigger (or the next full window when free-running). *Keep as
reference* stores a copy that is drawn in amber behind the live trace.

**CSV format.** Lines beginning with `#` are `key: value` metadata: `source`, `source_label`,
`sample_rate_hz`, `captured_at` (ISO 8601), `samples`, `duration_s`, `trigger_mode`,
`trigger_level`, `trigger_sample_index` (row index of the trigger point or `none`),
`amplitude_units`, one `note` per processing note, `app` and `display_gain`. Then a header row
`time_s,amplitude` followed by one row per displayed sample. `time_s` starts at 0 for the first
exported sample and advances by `1 / sample_rate_hz`; `amplitude` is normalized (−1..+1).

**PNG export** renders the frozen trace at 1200 × 640 (2× resolution) with the source, sample
rate, scale, trigger settings, capture time and axis labels.

Exports always contain the actual captured samples of the labelled source; simulated data is
labelled `source: demo`.

## Architecture

```
src/signal/    pure DSP, no DOM: types, generator, ring buffer, trigger, FFT, analysis, envelope, CSV
src/audio/     Web Audio: shared AudioContext, capture + demo AudioWorklet processors, live input, playback
src/engine/    ScopeEngine (acquisition state, freeze/single, display windows), analysis worker/client
src/ui/        React components, canvas renderers, PNG export, hooks
src/content/   guided experiments and hardware guide text
tests/         vitest unit tests        e2e/  Playwright browser tests
```

Key decisions:

* **Capture** uses an `AudioWorkletNode` that forwards 2048-sample blocks to the main thread, where a
  bounded ring buffer keeps 4 s of history (memory is fixed at construction). No deprecated
  `ScriptProcessorNode`.
* **Rendering** is a `requestAnimationFrame` loop that asks the engine for a display window each
  frame and draws to a canvas; React state is never updated per frame. When more than two samples
  map to a pixel column a **min/max envelope** is drawn so short peaks survive.
* **Analysis** (NSDF pitch, RMS, peak, clipping, FFT) runs in a **Web Worker** at ~10 Hz on a
  4096-sample block, with inline fallback if Workers are unavailable. Results reach React through
  `useSyncExternalStore`.
* One shared `AudioContext`, created on the first user gesture that needs it and reused across mode
  switches; worklet modules are registered once. Switching modes stops old tracks and disconnects old
  nodes.
* All audio stays on the device. There is no backend, analytics, upload or recording.

Keyboard: `Space` run/freeze, `S` single, `A` auto-scale (when focus is not in a control).

## Licence and trademarks

"Cambridge BrainBox" is a trademark of its owner. Wave Lab is an unaffiliated, independent project.
