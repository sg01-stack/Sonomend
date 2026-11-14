# Sonomend

A mobile-first, on-device hackathon MVP: **Calibrate → Start Trip → End Trip → Trip Report**. Plain TypeScript, CSS, Vite, Web Audio, Geolocation, and IndexedDB. No backend, account, paid API, cloud inference, remote fonts, or external map tiles. All runtime assets are built locally.

## Run

Requires Node 22.12+ (tested with Node 24.22.1) and npm.

```sh
cd /workspace/Sonomend
npm ci
npm run dev
```

Vite serves port **5173**. On a regular local checkout, use your checkout directory instead of `/workspace/Sonomend`. If the environment does not allow the default npm cache, use `npm --cache /workspace/.npm-cache ci`.

```sh
npm test            # deterministic detector, trip/scoring, and IndexedDB tests
npm run build      # strict TypeScript check and static production bundle
npm run preview    # serve dist on port 4173
npm run test:e2e    # Chromium UI, Web Audio, permission, persistence, and demo checks
```

Browser tests use `/usr/bin/chromium` by default. Set `CHROMIUM_PATH` to your Chrome/Chromium executable on another machine, or run `npx playwright install chromium` and set it to that installed executable. The browser test harness uses synthetic tones and simulated positions; it does not validate real-world detection accuracy. Test output and screenshots are in ignored `test-results/`.

## Use the MVP

1. Open the app over **HTTPS** on Android Chrome. Localhost is allowed for desktop development; an ordinary phone-to-laptop HTTP LAN URL is **not** a secure context for microphone access.
2. While safely parked where brief honking is permitted, choose **Calibrate my horn** and enable the mic. Take a two-second background sample, then three separate three-second samples, honking once in each. Samples can be redone. Save calibration. Quiet/no-signal samples are rejected.
3. Start a trip and allow location. Keep the app foregrounded and phone mounted. The app requests a screen wake lock where available but does not depend on it. Avoid interacting while driving.
4. End the trip to release microphone tracks, the audio context, GPS watcher, timers, and wake lock. The report is saved in IndexedDB. Reload and choose **View report**, or open **Trip history**.
5. Export a report JSON if desired. Exports contain precise route locations; share deliberately. Nothing is uploaded automatically.

If permission is denied, enable it in browser site settings and use the retry button. A blocked mic prevents starting a microphone trip; unavailable GPS allows unlocated detections but cannot award affected quiet-crossing points. If local saving fails, the report stays in memory with retry and export controls. Do not reload until it is saved/exported.

## Rehearse a 60-second demo

The default **Demo Trip** uses **real microphone audio** and a deterministic simulated GPS route through the bundled demo zones. It requires calibration. No actual movement is needed.

| Approximate time | What to do / expected behavior                                                                                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0–11 s           | Approach Garden; keep quiet.                                                                                                                                                                      |
| 12–26 s          | Traverse Garden quiet zone without a sound candidate; earn one point on exit.                                                                                                                     |
| 27–42 s          | Approach Library.                                                                                                                                                                                 |
| 44–46 s          | Play a **fresh recording** of the calibrated horn near the phone. A sufficient match should become a review item in Library and be tagged near the marked corner. This requires phone validation. |
| 54–60 s          | Exit Library. The trip ends automatically at 60 seconds and opens the report. You may also end it manually.                                                                                       |

For an entirely deterministic pitch rehearsal, select **Simulated audio · deterministic test**. This is conspicuously labeled throughout and uses no mic or real GPS. It feeds generated feature frames through the actual spectral detector and the same trip engine. The expected report has **1 point, 1 likely match, 1 review item, and a near-corner tag**. Simulated inputs never overwrite your calibration.

Enable **Simulate GPS dropout in first zone** to drop positions at 13–19 seconds. The first crossing becomes **Unscored**; the simulated-audio demo yields **0 points**. This preference persists. Turn it off for the clean rehearsal. For mic-dropout rehearsal with real audio, briefly switch apps during Garden and return; that crossing must remain unscored. Keep the page visible for the normal demo.

## Free on-device AI + your personal fingerprint

The default is **YAMNet + personal matching**, with **Spectral matching** retained as a working fallback. Enable **Use free on-device AI** on the overview and recalibrate to create a private AI profile. Existing spectral calibrations and old reports remain compatible. There are no API keys, paid requests, accounts, cloud inference, or third-party runtime downloads. Model weights, worker code, and WASM are served from your static host. The complete static build is about 13 MB, including a 4.1 MB quantized model.

The app combines three checks instead of choosing one:

1. YAMNet's road-vehicle horn classes provide **horn evidence**.
2. Its 1,024-dimensional embeddings are compared with your three calibration honks. At least two samples must support a match; a single outlier cannot define your profile.
3. The spectral fingerprint provides additional frequency-pattern evidence. A saved background embedding helps reject sounds resembling the calibration background.

Calibration still uses two seconds of background plus three separate short honks. Spectral fingerprints are always captured. Each AI sample additionally needs a complete, sufficiently loud 975 ms window with horn evidence. If AI cannot recognize a sample, the screen explains that it captured only the spectral fingerprint: redo that sample, or save a working spectral calibration. All three AI samples and a background embedding are needed for an AI profile. Saving it persists only features and scores in IndexedDB, never raw audio.

Microphone input runs through a 16 kHz AudioContext. An AudioWorklet captures overlapping 15,600-sample windows with a 480 ms hop. A separate classic Web Worker runs single-threaded TensorFlow Lite WASM, keeping inference off the UI/audio threads; cross-origin isolation headers are not required. Only one inference is in flight. Audio is held in a bounded rolling buffer, transferred for processing, and cleared afterward. The model's SHA-256 is checked at build time and before loading in the browser. Failed integrity/loading checks, unsupported AI capture, inference errors/timeouts, or consistently slow inference trigger a visible spectral fallback. Trip scoring continues using that detector, and reports identify each event's actual detector and fallback reason.

The spectral detector still provides precise event boundaries: 48 logarithmic frequency bands from 120–6000 Hz, an adaptive RMS gate, at least three positive frames over 120 ms, and a 480 ms event separation gap. AI evidence enriches those events without changing sustained-honk merging. A likely personal match currently requires horn score ≥0.20, agreement with the best two personal embeddings ≥0.82, spectral similarity ≥0.75, and personal-versus-background margin ≥0.08. The displayed combined match is 65% embedding similarity and 35% spectral similarity. Other candidates remain **Uncertain**, conservatively preventing silent-crossing points. No model threshold is a validated ownership probability.

YAMNet is a free pretrained general sound classifier; Sonomend's private multisample matching, background comparison, coverage-aware scoring, and context review provide the personalization. Similar horns can still match. Short sounds, cabin noise, phone position, and device constraints can cause misses or false matches. Real-world accuracy is **not yet measured**. No events are labeled confirmed horns or proven unnecessary.

Model provenance, checksums, Apache-2.0 licensing, and the small reproducible graph change that exposes existing embeddings are documented in `public/models/README.md` and `THIRD_PARTY_NOTICES.md`. No retraining or model API is required. `npm run prepare:ai` builds/copies local runtime assets automatically before `npm run dev` and `npm run build`.

## Zones and scoring

Edit `public/zones.json` and rebuild. Alternatively load a local JSON in **Permissions, demo zones & limitations** for the current real-trip session. Demo Trip always uses the bundled demo zones so it stays repeatable. The bundled markers are explicitly fictional, centered in Bengaluru. They are **not official restrictions** or corners inferred from GPS.

```json
[
  {
    "id": "example",
    "name": "My marked place",
    "latitude": 12.9716,
    "longitude": 77.5946,
    "radius": 80,
    "type": "quiet zone"
  }
]
```

IDs must be unique; radius is in meters (20–5000). Supported types are `quiet zone` and `marked corner`. At most 100 zones can be loaded. Each saved trip contains a zone snapshot, so edits do not change old reports.

- GPS fixes retain timestamps and reported accuracy. Event locations require a prior fix at most 5 seconds old, accuracy at most 35 m, and no active GPS interruption. Unlocated events stay in reports.
- A quiet zone is entered only when the fix plus its accuracy radius is inside the boundary. Exit requires the fix minus accuracy to exceed the radius by 15 m. Rearming after exit requires another outside fix beyond radius + accuracy + 40 m; this limits repeated points from boundary drift. Extremely fast traversals between sparse fixes are not inferred.
- One point requires observed entry and exit, uninterrupted usable mic/GPS coverage, and no likely **or uncertain** detection overlapping that crossing. Unlocated detections during a crossing also prevent points conservatively.
- Crossings starting inside, missing an exit, or intersecting poor/stale GPS, mic suspension, processing pauses, or a hidden page are **Unscored** with reasons. Entire zones missed while GPS is unavailable cannot be reconstructed; coverage gaps are reported.
- Likely matches located within a quiet zone's radius plus reported accuracy receive **Review**. This includes possible boundary overlap conservatively. Nearby marked corners are tagged the same way. Neither earns bonus points. Detections outside zones have no zone score.
- Late-finalized detections can revise a recently exited crossing. The final report recomputes scores. Live point counts are provisional while an event is still being merged.

## Repeated honks and point deductions

**Apply repeat-honk deductions** is enabled by default for new trips and can be disabled in settings. The chosen rule is saved with each trip, so changing it later does not rewrite history. Older reports have no new deductions.

A **Repeated horn pattern · Review** requires three distinct likely-own events within ten seconds, separated by at least 480 ms, with usable locations in the same complete quiet-zone crossing. Missing mic/GPS coverage, uncertain or unlocated events, incomplete traversal, or one sustained honk cannot trigger a deduction. The rule deducts **one point maximum per crossing**, avoids double-counting the same events in overlapping zones, and never penalizes events outside quiet zones. Net points can be negative. The report shows earned crossing points, deductions, and the reason; disabling deductions retains review flags without subtracting points.

This is an explicit, configurable game rule—not an AI determination that a honk was unnecessary. Audio and GPS cannot establish intent or road danger.

For a repeatable rehearsal, select **Simulated audio · deterministic test**, then **Simulate three separate honks**. Library gets pulses at 44, 46, and 48 seconds. The expected net score is **0**: +1 clean Garden crossing and −1 repeat adjustment in Library. Disable the deduction setting for a new trip to get **1** point with a review-only pattern. These demo pulses are feature-level simulated input; the real AI path is separately tested with synthetic audio through Web Audio and the bundled model.

## Free static HTTPS deployment

`npm run build` generates `dist/`. It is self-contained; `base: './'` supports subdirectory hosting. Deploy **all contents** of `dist`, including `models/`, `ai-runtime/`, `pcm-worklet.js`, `zones.json`, `favicon.svg`, and `assets/`. No environment variables or secrets are required. The application requires no account; a hosting provider may require one for deployment.

For GitHub Pages (free for a public repository):

1. Keep app source on the development branch. Build locally or in CI with `npm ci && npm run build`.
2. Use GitHub Pages' static artifact deployment to publish the contents of `dist` (the standard `actions/upload-pages-artifact` / `actions/deploy-pages` flow), or put those contents on a dedicated `gh-pages` branch and select that branch in **Settings → Pages**. Do not overwrite source files with build output.
3. Enable HTTPS and test the resulting HTTPS site on Android Chrome. No SPA rewrite rule is needed because navigation stays in-page.

Any free static HTTPS host that serves the same directory works. Deployment was **not** performed by this task. An installed offline PWA/service worker is not included: runtime requests are local to the deployed origin, but a first load/reload still needs the static files. Completed history/calibration survive reload on that origin; browser storage clearing, eviction, private mode, or changing origin can remove/isolate them. An active trip is in memory until ended, with a navigation warning; force-closing the browser can lose it.

## Android test checklist — physical device still required

- Grant and deny both permissions; verify retry and HTTPS messaging. Confirm the live meter and usable GPS accuracy outdoors.
- Calibrate the actual vehicle while parked. For testing, use **new recordings not used during calibration** of (a) that horn, (b) a different horn, and (c) a siren or other distractor. Record device, volume/distance, background, match scores, missed detections, and false matches. Do not claim accuracy without a labeled evaluation.
- Play a sustained honk, then two distinct honks separated by at least 0.5 seconds; verify one versus two events. Very short honks below the minimum duration can be missed.
- Confirm the calibration screen saves all three personal AI fingerprints; test the visible spectral fallback with AI disabled.
- Rehearse the real-mic demo: clean Garden crossing, fresh horn playback at 44–46 seconds in Library, review item, and corner tag. If a distractor is loud enough, it may be uncertain or even match; document the result honestly.
- Repeat with GPS dropout. Then switch apps/lock the screen during a crossing, take a call, or disconnect a microphone. Verify interruption status, resume controls, and no point for the affected crossing.
- End the trip; verify Chrome's microphone indicator stops and GPS watcher ends. Reload and reopen the report. Confirm calibration and demo settings persist.
- Check an actual stationary/slow outdoor route with local custom zones for GPS drift. Confirm unlocated events remain visible and boundary jitter does not repeatedly award points.

## Code map

| File                           | Responsibility                                                             |
| ------------------------------ | -------------------------------------------------------------------------- |
| `src/main.ts`, `src/style.css` | UI and session orchestration; restyle via CSS variables                    |
| `src/audio.ts`                 | Microphone lifecycle, spectral feature extraction, interruptions           |
| `src/ai/`                      | Bundled-model worker client, private embedding matching, bounded inference |
| `src/scoring.ts`               | Repeat-honk review and configurable deductions                             |
| `src/detector.ts`              | Replaceable detector interface, similarity, event merging                  |
| `src/trip.ts`                  | Pure GPS coverage, crossings, contextual event tags, scoring               |
| `src/storage.ts`               | IndexedDB calibration, settings, trip history, latest report               |
| `src/demo.ts`                  | Deterministic positions and separately labeled synthetic audio             |
| `src/route.ts`                 | Local SVG route sketch; does not bridge GPS gaps                           |
| `tests/`                       | Deterministic and browser checks                                           |

See `VERIFICATION.md` for the checks actually run and their limits.
