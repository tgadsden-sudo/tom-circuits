# Wave Lab — completion report

## Implemented

* **Oscilloscope**: canvas display with 10 × 8 grid, labelled time axis (relative to the trigger)
  and amplitude axis; time/division 100 µs–200 ms; display gain ×0.5–×50; run/freeze; single
  capture; auto-scale; free-running, rising- and falling-edge trigger with adjustable level and
  hysteresis; honest *waiting for trigger*, *no crossing found* (untriggered signal shown dimmed) and
  *armed* states; reset to defaults; min/max envelope drawing when samples exceed pixels; visible
  time window = time/div × 10 at the real sample rate; display gain never touches samples or
  readings; frozen data stays zoomable and exportable; keyboard shortcuts and visible focus.
* **Spectrum**: 4096-point Hann-windowed FFT (own radix-2 implementation), bins mapped with the
  actual sample rate, dBFS normalized so a full-scale sine is 0 dBFS, selectable range up to
  Nyquist, interpolated dominant-peak marker, explicit note that the peak is not necessarily the
  pitch. Side-by-side on desktop, tabbed on phones.
* **Measurements**: NSDF (McLeod) fundamental-frequency estimate with clarity gating and a
  stability check (`—`, `unstable`, `insufficient signal`, `insufficient samples`), period, RMS
  (normalized and dBFS), peak-to-peak, actual sample rate, input-clipping flag distinct from the
  display-clipping note.
* **Demo generator**: band-limited additive sine/square (with duty cycle)/triangle/sawtooth,
  white noise, exponential siren with low/high/rate controls; identical generator code on the main
  thread and inside an AudioWorklet; optional audible playback off by default, starts on a gesture at
  low volume, prominent stop, stops automatically when switching to live input.
* **Live input**: getUserMedia with echoCancellation/noiseSuppression/autoGainControl requested off
  and the browser's actual settings reported; device list after permission; permission denied, no
  device, busy device, disconnected track, suspended AudioContext (with resume) and cancellation of a
  pending request all handled; a stream resolving after cancellation is stopped; old tracks and nodes
  are torn down on every change; explicit *Disconnect input*; microphone is never routed to the
  speakers (worklet outputs silence into a zero-gain node); AudioWorklet capture, no
  ScriptProcessorNode; secure-context and embedded-preview guidance; all processing local.
* **Capture/export**: freeze, CSV with documented metadata header and per-sample times, PNG with
  header and axes, reference trace overlay.
* **Guided experiments**: five "Try this" activities with do/look-for/why and a set-up button that
  configures the scope; microphone activities only switch the tab and never request permission.
* **Hardware guide**: in-app panel and `HARDWARE.md` with the four-mode distinction and the required
  safety statement; no speculative wiring.
* **Docs**: `README.md`, `HARDWARE.md`, `RESEARCH.md`, this report.

## Tests actually run

* `npm test` — 28 vitest unit tests, all passing: sine RMS ≈ A/√2 and p2p ≈ 2A at 44.1/48/96 kHz;
  square/triangle/sawtooth bounds; siren frequency range; generator continuity; NSDF frequency within
  0.5 % for 82–2500 Hz at 22.05/44.1/48/96 kHz; square-wave fundamental (not harmonic); silence and
  −66 dBFS give no frequency; white noise confident in ≤ 1 of 20 trials; short block → insufficient;
  input clipping only for pinned samples; stabilizer; FFT bin mapping and 0 dBFS normalization at
  two sample rates; off-bin peak interpolation; trigger rising/falling/absent/hysteresis/short
  buffer; ring buffer wrap-around; envelope preserves one-sample spikes; CSV metadata and timing.
* `npm run test:e2e` — 13 Playwright tests in Chromium against the production build, all passing:
  demo opens with 440 Hz/RMS/p2p readings and painted trace; controls change the real signal while
  gain changes only the display; noise → `—`, siren → `unstable`, amplitude 0 → insufficient signal;
  trigger states; freeze → CSV (960 rows at 2 ms/div and 48 kHz, 1/48000 s spacing, 440 Hz by
  zero-crossing, trigger at row 96 on a rising crossing), zoom-while-frozen export (480 rows), PNG
  signature, reference trace, single-capture arming and freezing; auto-scale; no-device and
  permission-denied flows leave a usable UI; try-this set-ups never request permission; keyboard;
  phone layout without horizontal overflow and with ≥ 34 px buttons; **simulated microphone**
  (Chromium fake device) connect → live badge, real context sample rate (44.1 kHz in this
  environment), non-zero data, disconnect, reconnect, switch to demo; cancelling a pending request;
  audible playback start/stop and auto-stop on live mode. No console errors in any exercised flow.
* Manual screenshot review of desktop, microphone and phone layouts.

## Limitations and unverified items

* **No physical BrainBox integration was tested**; live-input testing used Chromium's fake audio
  device. Real microphones and audio interfaces were not available in this environment.
* The original programme's features and connection method remain unverified (see `RESEARCH.md`);
  no cable compatibility is claimed.
* Readings are uncalibrated (normalized / dBFS). Audio inputs cannot show DC or non-audio bandwidth.
* Browsers may still apply microphone processing despite the request to disable it.
* Tested only in Chromium here; Firefox and Safari support the same APIs but were not exercised.
* Only one channel (channel 0) of a multi-channel input is displayed.
* No deployment was performed; see the README for local run/build instructions.
