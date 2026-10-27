# Ancient Grove — Logic Pro AU instrument (v0.1)

This is the native macOS Audio Unit instrument version of Delicious-old-one.
It is separate from the browser sampler and does not replace GitHub Pages.

- Lute, harp, recorder, vielle and wordless choir-inspired synthetic voices.
- 16-voice MIDI polyphony; velocity, note off, sustain pedal and ±2-semitone pitch bend.
- Reverb and volume automation; instrument and parameter state saved by the host.
- An on-screen MIDI keyboard. No microphone, network service, API key or recorded human voice required at runtime.
- The AU does not import the web sequencer, web patterns or user audio samples in v0.1.
- Synthesised timbres are artistic approximations, not historical instrument recordings.

## Get the macOS build

Open the repository's **Actions → Build Logic AU** run. Once successful, download
**Ancient-Grove-AU-macOS** from **Artifacts**, and extract the archive.
The archive contains `Ancient Grove.component` (Apple Silicon + Intel universal)
and this README. You must be signed in to GitHub to download Actions artifacts.

## Install in Logic Pro for Mac

1. Quit Logic Pro.
2. Copy `Ancient Grove.component` to `~/Library/Audio/Plug-Ins/Components/`.
   In Finder use **Go → Go to Folder** and paste that path. Create the folder if absent.
3. Reopen Logic. Create a Software Instrument track, then choose
   **AU Instruments → Lion Melody → Ancient Grove → Stereo**.
4. If absent, open Logic's Plug-in Manager, find Ancient Grove and use **Reset & Rescan Selection**.

The CI build is ad-hoc signed, not notarised with an Apple Developer identity.
macOS may require its normal approval flow. Do not disable Gatekeeper or other
security protections. No installer or security-bypass script is included.

## Build and validate yourself

Requires macOS 11+, Xcode Command Line Tools, CMake 3.22+ and internet access to
fetch JUCE 8.0.6 on the first build. From this folder:

```sh
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release '-DCMAKE_OSX_ARCHITECTURES=arm64;x86_64' -DCMAKE_OSX_DEPLOYMENT_TARGET=11.0
cmake --build build --config Release --target AncientGrove_AU -j 3
```

The GitHub workflow builds a universal AU, performs ad-hoc signing and runs
Apple's `auval -v aumu Ag01 LmLy`. That check does not replace opening and testing
in Logic Pro on your own Mac. Check note release, sustain pedal, chords,
automation, project save/reopen and offline bounce before relying on a session.

## Licensing

The new native AU source (`Plugin.cpp`, CMake configuration) is provided under
**AGPL-3.0-or-later**, compatible with JUCE's open-source licensing route.
JUCE 8.0.6 is fetched from the official repository, with its own notices.
Full AGPL text: https://www.gnu.org/licenses/agpl-3.0.html
This notice applies to the native AU code and does not relicense the web app.
No commercial JUCE licence or Apple developer subscription has been purchased.
