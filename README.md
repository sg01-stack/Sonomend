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

## Detector shipped: Spectral matching

YAMNet feasibility was checked before integration: the official [YAMNet README](https://github.com/tensorflow/models/tree/master/research/audioset/yamnet) describes the Python/Keras model, 16 kHz preprocessing, 0.96-second patches, and 1024-dimensional embeddings. A request to the candidate TF Hub browser-model endpoint was blocked with HTTP 403 by the environment network policy. No browser model artifact was downloaded or validated. To preserve the complete MVP within the 90-minute model-integration budget, this build uses the requested real Web Audio fallback. It does not include YAMNet or pretend to classify general horns.

`src/audio.ts` captures mono input with echo cancellation, noise suppression, and automatic gain control requested off (devices may ignore constraints). A 2048-point analyser produces 48 fixed logarithmic frequency bands from 120–6000 Hz and RMS every 60 ms. Raw waveform buffers are overwritten, not recorded or saved. Calibration retains only normalized spectral fingerprints, level references, and background RMS.

`src/detector.ts` compares each sufficiently loud frame with the calibration fingerprints using cosine similarity. A mean event match of at least 0.90 is labeled **Likely your horn**; sufficiently loud lower-similarity candidates are **Uncertain**. Energy gating adapts to the captured noise level and sample levels. Three positive frames spanning at least 120 ms are needed; adjacent positives with less than 480 ms silence merge. A sustained honk counts once; a clear gap of at least 480 ms separates events.

This is a simple baseline: similar horns, speech, sirens, music, clipping, ambient noise, and changes of phone position can cause misses or matches. The percentage is a **similarity score, not an ownership probability**. There are no confirmed-horn labels or accuracy claims. “Review” and “Near marked corner” provide context only, not a judgment of why the driver honked.

The `Detector` interface isolates detection from trip/scoring code. A future model-backed implementation can buffer/resample audio, run a locally bundled YAMNet model, and emit the same `Detection` shape. Model files, licenses, integrity, preprocessing, mobile performance, and validation would need to be verified before shipping that replacement.

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

## Free static HTTPS deployment

`npm run build` generates `dist/`. It is self-contained; `base: './'` supports subdirectory hosting. Deploy **all contents** of `dist`, including `zones.json`, `favicon.svg`, and `assets/`. No environment variables or secrets are required. The application requires no account; a hosting provider may require one for deployment.

For GitHub Pages (free for a public repository):

1. Keep app source on the development branch. Build locally or in CI with `npm ci && npm run build`.
2. Use GitHub Pages' static artifact deployment to publish the contents of `dist` (the standard `actions/upload-pages-artifact` / `actions/deploy-pages` flow), or put those contents on a dedicated `gh-pages` branch and select that branch in **Settings → Pages**. Do not overwrite source files with build output.
3. Enable HTTPS and test the resulting HTTPS site on Android Chrome. No SPA rewrite rule is needed because navigation stays in-page.

Any free static HTTPS host that serves the same directory works. Deployment was **not** performed by this task. An installed offline PWA/service worker is not included: runtime requests are local to the deployed origin, but a first load/reload still needs the static files. Completed history/calibration survive reload on that origin; browser storage clearing, eviction, private mode, or changing origin can remove/isolate them. An active trip is in memory until ended, with a navigation warning; force-closing the browser can lose it.

## Android test checklist — physical device still required

- Grant and deny both permissions; verify retry and HTTPS messaging. Confirm the live meter and usable GPS accuracy outdoors.
- Calibrate the actual vehicle while parked. For testing, use **new recordings not used during calibration** of (a) that horn, (b) a different horn, and (c) a siren or other distractor. Record device, volume/distance, background, match scores, missed detections, and false matches. Do not claim accuracy without a labeled evaluation.
- Play a sustained honk, then two distinct honks separated by at least 0.5 seconds; verify one versus two events. Very short honks below the minimum duration can be missed.
- Rehearse the real-mic demo: clean Garden crossing, fresh horn playback at 44–46 seconds in Library, review item, and corner tag. If a distractor is loud enough, it may be uncertain or even match; document the result honestly.
- Repeat with GPS dropout. Then switch apps/lock the screen during a crossing, take a call, or disconnect a microphone. Verify interruption status, resume controls, and no point for the affected crossing.
- End the trip; verify Chrome's microphone indicator stops and GPS watcher ends. Reload and reopen the report. Confirm calibration and demo settings persist.
- Check an actual stationary/slow outdoor route with local custom zones for GPS drift. Confirm unlocated events remain visible and boundary jitter does not repeatedly award points.

## Code map

| File                           | Responsibility                                                   |
| ------------------------------ | ---------------------------------------------------------------- |
| `src/main.ts`, `src/style.css` | UI and session orchestration; restyle via CSS variables          |
| `src/audio.ts`                 | Microphone lifecycle, spectral feature extraction, interruptions |
| `src/detector.ts`              | Replaceable detector interface, similarity, event merging        |
| `src/trip.ts`                  | Pure GPS coverage, crossings, contextual event tags, scoring     |
| `src/storage.ts`               | IndexedDB calibration, settings, trip history, latest report     |
| `src/demo.ts`                  | Deterministic positions and separately labeled synthetic audio   |
| `src/route.ts`                 | Local SVG route sketch; does not bridge GPS gaps                 |
| `tests/`                       | Deterministic and browser checks                                 |

See `VERIFICATION.md` for the checks actually run and their limits.
