# Verification — AI and repeated-honk update

Validated in this workspace on 14 November 2026 with Node 24.22.1 and Chromium 156. No physical phone or actual vehicle horn was available.

## Automated results

- **34 logic/storage tests passed** across five files, with no failures or skips.
- **9 Chromium browser tests passed**, with no failures or skips.
- **Production build passed**, including TypeScript, model integrity verification, local worker bundling, and Vite.
- **Built-app smoke check passed** on port 4173: actual local model inference, repeat-honk net score 0, saved report after reload, no browser errors/external requests, and no horizontal overflow at 390 px.

The original detector, coverage, GPS, scoring, IndexedDB persistence, permission-retry, session cleanup, duplicate-start, and deterministic demo tests still pass.

New logic checks cover personal embedding consensus, a different horn profile, weak general-horn evidence, resemblance to background, low spectral agreement, old-calibration/missing-window fallback, and selection of complete calibration windows. Repeat scoring checks cover the one-deduction-per-crossing cap, missing coverage, uncertain/unlocated events, sustained honks, the ten-second window, disabled deductions, and compatibility with old reports.

New browser checks run the **actual bundled YAMNet model** and **actual AudioWorklet/Web Audio calibration pipeline**:

1. Model integrity mismatch is rejected; genuine model inference returns 521 scores and 1,024 finite embedding values. Silence's top class is Silence. A generated, enveloped harmonic pulse produces road-horn evidence. All assets are requested from the app's origin; no external inference calls occur.
2. Three synthetic pulses pass the real calibration UI and model, creating three personal AI fingerprints. The profile survives reload. A fresh pulse in microphone-demo mode passes through capture, model, personalized comparison, and the report. The report retains separate model/embedding/spectral scores after reload. End Trip stops the audio tracks.
3. Blocking the model request gives visible **Spectral matching** fallback while microphone calibration remains usable.
4. The scripted repeat-honk route yields +1 Garden crossing and −1 Library adjustment (net 0). Changing the preference leaves the saved trip unchanged. A new trip with deductions disabled retains the review pattern and yields 1 point.

Existing and new screenshots include the mobile AI report and desktop overview. Synthetic signals and simulated positions are test inputs, not a measured vehicle-recognition dataset. Cloud CPU inference timing is not an Android benchmark.

## Still requires a physical Android device

Fresh recordings of the calibrated horn, different horns, sirens, cabin noise, device placement, GPS drift, lock/call interruptions, battery usage, and real-world false-positive/missed-event rates. Follow `README.md`'s phone checklist. Similar horns may match; neither AI nor a repeated pattern establishes who honked or whether it was necessary. Deployment to a public HTTPS host has not been performed.
