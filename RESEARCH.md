# Research note: the original "Cambridge BrainBox — Oscilloscope Programme"

Bounded search performed 2026-09-14 from a sandboxed environment. Most product and third-party pages
(including `cambridgebrainbox.com`) were **blocked by the environment's network egress policy**, so
only search-engine snippets could be read. Nothing below should be treated as a full reading of the
manufacturer's documents.

## Verified from the user's own materials

* The Explorer 2 kit ships with a CD labelled "Cambridge BrainBox — Oscilloscope Programme"
  (stated by the user).
* The manufacturer's brochure (issue 10b, Explorer 2 section, page 7) says the software displays
  waveforms produced by circuits and helps children observe the effects of circuit changes:
  <https://www.cambridgebrainbox.com/wp-content/uploads/2023/02/cambridge-brainbox-brochure-issue-10b.pdf>
  (provided by the user; the PDF could not be fetched from this environment).

## Found via search snippets (not independently verified)

* Manufacturer product page snippet: "The Explorer 2 Electronics Kit now has software that converts
  your computer into an oscilloscope. Using this you can explore the wave forms produced by the
  circuits and see the results of any changes you make to the circuit."
  <https://www.cambridgebrainbox.com/product/cambridge-brainbox-explorer-2-electronics-kit/> and
  <http://www.cambridgebrainbox.com/Explorer2.html>
* Retail listings repeat that "the set includes a disk with software to turn your computer into an
  oscilloscope" and that the kit is aimed at ages 11–14 with a printed experiment manual:
  <https://curiousminds.co.uk/products/cambridge-brainbox-explorer-2-electronics-kit>,
  <https://www.ultimastore.co.uk/product/explorer2-electronic-kit/>,
  <https://www.therange.co.uk/toys/creative-and-educational/science-kits/cambridge-brainbox-explorer-2-electronics-kit>
* The Secondary 2 kit is described with the same oscilloscope software:
  <https://www.cambridgebrainbox.com/product/cambridge-brainbox-secondary-2-electronic-scientific-educational-kits/>
* A "Cambridge BrainBox Kits User Guide" exists on a manual-sharing site but could not be opened:
  <https://manualzz.com/doc/7142372/cambridge-brainbox-kits-user-guide>
* A third-party review of the Primary 2 kit's instruction quality exists but could not be opened:
  <https://www.petervis.com/electronics-lab/cambridge-brainbox-primary-2-electronics-kit/primary-2-electronics-kit-instructions.html>

## Not found / unresolved

* **No downloadable copy** of the oscilloscope programme, and no manufacturer page describing its
  features, screen layout or system requirements.
* **How the kit connected to the computer.** One search summary characterised the software as using
  the computer's *sound card*, which is plausible for software of this type, but no manufacturer text
  stating this was read. The cable, the connector, whether it was the microphone or line input, and
  what (if any) attenuation or protection sat between the kit and the computer are all **unverified**.
* **Which experiments** in the printed manual use the oscilloscope, and their numbering.
* Whether the software still runs on current operating systems.

## Consequences for Wave Lab

* Wave Lab is presented as an independent companion, not as a replacement for or clone of the
  original programme.
* No claim of cable compatibility is made. Direct electrical connection is described only as
  conditional on a verified protected interface (see [HARDWARE.md](HARDWARE.md)).
* No BrainBox experiment numbers, wiring diagrams or pinouts are invented; the guided activities refer
  the user to the kit's own manual for building sound-producing circuits.

If the original manual or CD documentation becomes available, its instructions should be cited in
HARDWARE.md and distinguished from the general guidance there.

## Addendum: Sabrent AU-UCMA USB-C audio adapter (searched 2026-09-14)

The manufacturer page <https://sabrent.com/products/au-ucma>, a hosted copy of its manual
(manuals.plus), a B&H listing and a forum practical test were all **blocked by the environment's
egress proxy**; only search snippets could be read.

Found via snippets (not independently verified):

* Two separate 3.5 mm jacks: one stereo headphone/line output and one **mono microphone input**;
  integrated USB-C cable; aluminium body; bus-powered; plug-and-play. Input and output described as
  16/24-bit up to 96 kHz.
  <https://www.amazon.com/SABRENT-Adapter-Headphone-Upgrade-AU-UCMA/dp/B0DGMVFY85>,
  <https://www.bhphotovideo.com/c/product/1926518-REG/sabrent_au_ucma_usb_c_to_dual.html>,
  <https://www.microcenter.com/product/690288/sabrent-usb-type-c-audio-adapter>
* A forum "practical test" reports use with iOS devices and 24-bit resolution being achievable, but
  its details could not be read:
  <https://forum.loopypro.com/discussion/64790/8-49-24-bit-96-khz-3-67-ms-sabrent-au-ucma-practical-test>
* A user manual exists but could not be opened:
  <https://manuals.plus/m/256309569049f3ee51b7a25e668b1b2455ab2256c82925b1862984bf1bd6c339>

Not found: any microphone-input sensitivity, maximum input level or voltage rating, plug-in-power
(bias) details, or TRS/TRRS wiring of the microphone socket. Wave Lab therefore states no input
limit and treats the required input conditioning as an open question.
