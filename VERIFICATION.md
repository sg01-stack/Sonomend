# MVP verification

Validated in this workspace on 14 November 2026 using Node 24.22.1 and Chromium 156. No physical phone or actual vehicle horn was available.

## Completed

| Check | Result |
| --- | --- |
| `npm test` | **19 passed**, 0 failed or skipped across 3 files. |
| `npm run build` | **Passed**: strict TypeScript and Vite production bundle. |
| `npm run test:e2e` | **5 passed**, 0 failed or skipped, mobile and desktop Chromium. |
| Production `dist/` browser smoke check | **Passed** on port 4173: completed demo, one point plus review, reload and reopen, no page errors, failed asset responses, external requests, or horizontal overflow at 390 px. |
| Visual inspection | Desktop overview and mobile trip report screenshots inspected. |

The deterministic tests exercised sustained-horn merging, separated honks, brief-gap merging, uncertain distractors, impulse/background rejection, calibration feature extraction, silent crossing points, quiet-zone reviews, corner tags, mic/GPS dropout exclusions, uncertain-event exclusions, stale/weak/unlocated GPS, incomplete crossings, starting inside a zone, boundary drift, late event finalization, idempotent trip end, and IndexedDB round-trips.

The browser checks exercised:

- Microphone denial and retry UI.
- The full background + three-honk calibration UI using **synthetic oscillator audio** delivered as a MediaStream into the real Web Audio analyser. Fingerprint extraction and spectral matching ran in Chromium; this did not use a physical microphone.
- Calibration persistence across reload, followed by a real-audio-pipeline demo with the synthetic tone. The detector produced a likely-match event and End Trip stopped the stream tracks. The report reopened after reload.
- Real-trip orchestration with a test position provider: duplicate Start clicks created one GPS watcher, a microphone interruption became visible, and End Trip cleared the watcher.
- The complete 60-second scripted route using Playwright's virtual clock, both with and without GPS dropout. Clean demo: **1 point, 1 likely match, 1 review item, Near marked corner**. Dropout demo: **0 points**, first crossing **Unscored**, review retained. Latest report persisted in both cases.
- Responsive overview rendering and local-only asset requests. A separate production smoke check exercised the built bundle rather than the Vite development server.

The initial tests exposed a demo timing mismatch (the scripted horn began before the second confirmed entry) and zero-duration startup gaps affecting scoring. Both were corrected and the affected tests passed. A CSS build import and missing Node configuration types were also corrected before the successful build.

## Not yet measured

- Horn detection accuracy, false-positive rate, and performance with a different horn, siren, noisy cabin, or fresh recordings.
- Android Chrome microphone constraints, real GPS drift, battery use, interruptions by calls/lock screen, and real-world coverage recovery.
- A published HTTPS deployment or restoration on another cloud task.

Use the physical Android checklist in `README.md`. The shipped detector is **Spectral matching**; YAMNet inference is not included. Browser and simulated checks establish implementation behavior, not real-world horn accuracy.
