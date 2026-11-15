# Verification — navigation, AI and repeated honks

Validated in this workspace on 15 November 2026 with Node 24.22.1 and Chromium 156. No physical phone or actual vehicle horn was available.

## Automated results

- **42 logic/storage/navigation tests passed** across six files, with no failures or skips.
- **13 Chromium browser tests passed against the production build**, with no failures or skips.
- **Production build passed**, including TypeScript, model integrity verification, local worker bundling, and Vite.
- **Release check passed** via `npm run check`: unit tests, strict build and the full browser suite on a fresh production preview server at port 4173. The bundled model, calibration, scoring, navigation and persistence are exercised using the exact static files intended for deployment.

The original detector, coverage, GPS, scoring, IndexedDB persistence, permission-retry, session cleanup, duplicate-start, and deterministic demo tests still pass.

New logic checks cover personal embedding consensus, a different horn profile, weak general-horn evidence, resemblance to background, low spectral agreement, old-calibration/missing-window fallback, and selection of complete calibration windows. Repeat scoring checks cover the one-deduction-per-crossing cap, missing coverage, uncertain/unlocated events, sustained honks, the ten-second window, disabled deductions, and compatibility with old reports.

New browser checks run the **actual bundled YAMNet model** and **actual AudioWorklet/Web Audio calibration pipeline**:

1. Model integrity mismatch is rejected; genuine model inference returns 521 scores and 1,024 finite embedding values. Silence's top class is Silence. A generated, enveloped harmonic pulse produces road-horn evidence. All assets are requested from the app's origin; no external inference calls occur.
2. Three synthetic pulses pass the real calibration UI and model, creating three personal AI fingerprints. The profile survives reload. A fresh pulse in microphone-demo mode passes through capture, model, personalized comparison, and the report. The report retains separate model/embedding/spectral scores after reload. End Trip stops the audio tracks.
3. Blocking the model request gives visible **Spectral matching** fallback while microphone calibration remains usable.
4. The scripted repeat-honk route yields +1 Garden crossing and −1 Library adjustment (net 0). Changing the preference leaves the saved trip unchanged. A new trip with deductions disabled retains the review pattern and yields 1 point.

Existing and new screenshots include the mobile AI report and desktop overview. Synthetic signals and simulated positions are test inputs, not a measured vehicle-recognition dataset. Cloud CPU inference timing is not an Android benchmark.

## Calibrate & Start and navigation

The new calibration action saves the profile and automatically starts one live trip, reusing the microphone and the existing GPS watcher. A dedicated browser test captures real Web Audio samples with synthetic input, double-clicks Save & Start, verifies one GPS subscription and the map, ends the trip, and verifies saved calibration after reload.

Routing logic checks cover coordinate parsing, provider geometry, upcoming turns (including a turn less than 10 m ahead), arrival, off-route distance, roundabouts, manual-search caching/throttling, provider rate limits, route coordinate order, and cancellation signals.

The mobile browser tests use **mocked OpenStreetMap tiles, Nominatim search and OSRM routes**, with simulated GPS fixes. They verify:

- No third-party map requests before per-trip online opt-in.
- Destination search, route drawing, turn advancement, persistent map/input across score updates, and a visible net-points map badge. A DOM-observer regression assertion first reproduced the map being detached during refresh; it passes after the renderer was changed to keep the map continuously mounted, preserving input focus.
- Rerouting only after three distinct off-route fixes, GPS-loss pause, and sensor cleanup on End Trip. A separate test simulates fixes going stale, rejects new routes until GPS recovers, keeps directions paused for 80 m accuracy, and resumes to arrival with a fresh 5 m fix. Missing coverage yields no quiet-crossing point.
- A routing-service 503 leaves microphone monitoring active; a local navigation demo still yields the expected score without map-provider requests.
- No horizontal overflow at 390 px; `test-results/navigation-mobile.png` captures the map and paused-GPS state.

Live public-provider access is **not verified**: the managed environment proxy returned 403 for the three map hosts. The required domains are saved in the environment configuration draft for review, without publishing it. Directions are a foreground, visual hackathon prototype; real road guidance, traffic, provider uptime and production-scale use have not been validated.

## Still requires a physical Android device

Fresh recordings of the calibrated horn, different horns, sirens, cabin noise, device placement, GPS drift, lock/call interruptions, battery usage, and real-world false-positive/missed-event rates. Follow `README.md`'s phone checklist. Similar horns may match; neither AI nor a repeated pattern establishes who honked or whether it was necessary. Deployment to a public HTTPS host has not been performed.
