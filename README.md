# Sonomend

Live site: [sonomend.onrender.com](https://sonomend.onrender.com)

A mobile-first, on-device hackathon MVP: **Calibrate & Start → Navigate + earn points → End Trip → Trip Report**. Plain TypeScript, CSS, Vite, Web Audio, Geolocation, and IndexedDB. The core needs no backend, account, paid API, cloud inference, or remote fonts. A separate optional hosted sound check is disabled by default. Audio inference and app assets run locally; optional online navigation uses free public map services.

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
npm run check       # unit tests + build + all browser checks against the built app
```

Browser tests use `/usr/bin/chromium` by default. On Windows the default is Chrome under Program Files. Set `CHROMIUM_PATH` to your Chrome/Chromium executable on another machine, or run `npx playwright install chromium` and set it to that installed executable. The browser test harness uses synthetic tones and simulated positions; it does not validate real-world detection accuracy. Test output and screenshots are in ignored `test-results/`.

See [HACKATHON.md](HACKATHON.md) for the demo script, release handoff and remaining external setup.

## Use the MVP

The landing **CALIBRATE** and **DEMO** buttons now request the microphone immediately and keep calibration inline beneath the selected button. Capture the two-second background and three three-second honk samples, one step at a time. The third accepted sample saves automatically and opens the map with the supplied pin drop and circular reveal. CALIBRATE follows real GPS; DEMO moves along its simulated route without location permission. The pin stays centered as the map moves. Street tiles still require **Enable online map** for each trip. Cancel releases the microphone, including permission granted after cancellation. The separate controls below the landing remain available for saved-profile trips and diagnostics.

1. Open the app over **HTTPS** on Android Chrome. Localhost is allowed for desktop development; an ordinary phone-to-laptop HTTP LAN URL is **not** a secure context for microphone access.
2. While safely parked where brief honking is permitted, choose **Calibrate & Start** and enable the mic. Take a two-second background sample, then three separate three-second samples, honking once in each. Samples can be redone. **Save & Start Trip** saves the fingerprints and immediately opens the trip with GPS navigation. Quiet/no-signal samples are rejected. The **Calibration** tab still supports saving without starting a trip.
3. Allow location. On future trips, **Start a trip** uses the saved calibration. The map opens automatically with your position, quiet zones, route trace, horn markers, and points. Enable online maps and choose a destination while parked (details below). Keep the app foregrounded and phone mounted. The app requests a screen wake lock where available but does not depend on it. Avoid interacting while driving.
4. End the trip to release microphone tracks, the audio context, GPS watcher, timers, and wake lock. The report is saved in IndexedDB. Reload and choose **View report**, or open **Trip history**.
5. Export a report JSON if desired. Exports contain precise route locations; share deliberately. Trip/calibration audio is never uploaded; the optional sound-check page can upload a separate clip after explicit consent. Optional online maps share the location data described below.

If permission is denied, enable it in browser site settings and use the retry button. A blocked mic prevents starting a microphone trip; unavailable GPS allows unlocated detections but cannot award affected quiet-crossing points. If local saving fails, the report stays in memory with retry and export controls. Do not reload until it is saved/exported.

## Integrated GPS navigation

Every trip opens a Leaflet map using the **same GPS watcher as scoring**. Your position, accuracy radius, fictional/custom quiet zones, trip trace and detected honks are local layers. The points badge stays beside the map. Old reports retain their local route sketches.

For streets and a driving route, tap **Enable online map** and enter a place name or `latitude, longitude`, then choose a result. You can also tap a map point. These services need no API key or paid plan:

- OpenStreetMap supplies street tiles, with visible contributor attribution.
- Nominatim handles explicit place searches (no autocomplete). Requests are throttled and cached during the trip. Coordinates bypass geocoding.
- The public OSRM driving service supplies the route and maneuver steps. The app advances on-screen instructions with GPS, shows approximate remaining distance/time, and follows your location. Panning pauses follow; **Recenter** resumes it. Three distinct fixes off-route trigger a reroute, at most once every 20 seconds.

Online mode is opt-in for each trip: tiles reveal the viewed area, searches go to Nominatim, and origin/destination coordinates go to OSRM. **No audio or AI fingerprints are sent.** Disable online maps to stop new provider requests; an already loaded route remains visible. GPS loss, stale fixes or accuracy worse than 35 m pause guidance. Network failures show an error while audio monitoring and coverage-aware scoring continue. End Trip releases the map, GPS watcher, microphone and pending search/route requests.

The scripted and microphone demos use a clearly labeled, locally generated navigation route. Street tiles are optional, so pitch rehearsal needs no map-provider connectivity.

This is a **hackathon navigation prototype**: visual driving instructions, no voice prompts, live traffic, offline street packs, background navigation, lane guidance, or production availability guarantee. Public community/demo services may throttle or change; review their [tile](https://operations.osmfoundation.org/policies/tiles/), [search](https://operations.osmfoundation.org/policies/nominatim/) and [routing](https://github.com/Project-OSRM/osrm-backend/wiki/Api-usage-policy) policies before a wider release. Endpoints are centralized in `src/navigation/services.ts` for replacement. Foreground use and an HTTPS phone field test are still required before relying on directions on a road.

Live desktop-browser requests from localhost on 17 November 2026 returned HTTP 200 for OpenStreetMap tiles and Nominatim search, and HTTP 200 / code Ok for OSRM routing. Regression tests still use controlled provider responses. These checks do not establish physical-phone GPS or real-road correctness.

## Rehearse a 60-second demo

The default **Demo Trip** uses **real microphone audio** and a deterministic simulated GPS route through the bundled demo zones. It requires calibration. No actual movement is needed.

| Approximate time | What to do / expected behavior                                                                                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0–11 s           | Approach Garden; keep quiet.                                                                                                                                                                      |
| 12–26 s          | Traverse Garden quiet zone without a sound candidate; complete the observed crossing; no per-crossing points.                                                                                                                     |
| 27–42 s          | Approach Library.                                                                                                                                                                                 |
| 44–46 s          | Play a **fresh recording** of the calibrated horn near the phone. A sufficient match should become a review item in Library and be tagged near the marked corner. This requires phone validation. |
| 54–60 s          | Exit Library. The trip ends automatically at 60 seconds and opens the report. You may also end it manually.                                                                                       |

For an entirely deterministic pitch rehearsal, select **Simulated audio · deterministic test**. This is conspicuously labeled throughout and uses no mic or real GPS. It feeds generated feature frames through the actual spectral detector and the same trip engine. Under the current rules the expected report has **0 penalties, 1 likely match, and a near-corner tag**. Simulated inputs never overwrite your calibration.

Enable **Simulate GPS dropout in first zone** to drop positions at 13–19 seconds. The first crossing becomes **Unscored**; incomplete coverage never earns daily rewards. This preference persists. Turn it off for the clean rehearsal. For mic-dropout rehearsal with real audio, briefly switch apps during Garden and return; that crossing must remain unscored. Keep the page visible for the normal demo.

## Free on-device AI + your personal fingerprint

The default is **YAMNet + personal matching**, with **Spectral matching** retained as a working fallback. Enable **Use free on-device AI** on the overview and recalibrate to create a private AI profile. Existing spectral calibrations and old reports remain compatible. The on-device pipeline needs no API keys, paid requests, accounts, cloud inference, or third-party runtime downloads. Model weights, worker code, and WASM are served from your static host. The complete static build is about 13 MB, including a 4.1 MB quantized model.

The app combines three checks instead of choosing one:

1. YAMNet's road-vehicle horn classes provide **horn evidence**.
2. Its 1,024-dimensional embeddings are compared with your three calibration honks. At least two samples must support a match; a single outlier cannot define your profile.
3. The spectral fingerprint provides additional frequency-pattern evidence. A saved background embedding helps reject sounds resembling the calibration background.

Calibration still uses two seconds of background plus three separate short honks. Spectral fingerprints are always captured. Each AI sample additionally needs a complete, sufficiently loud 975 ms window with horn evidence. If AI cannot recognize a sample, the screen explains that it captured only the spectral fingerprint: redo that sample, or save a working spectral calibration. All three AI samples and a background embedding are needed for an AI profile. Saving it persists only features and scores in IndexedDB, never raw audio.

Microphone input runs through a 16 kHz AudioContext. An AudioWorklet captures overlapping 15,600-sample windows with a 480 ms hop. A separate classic Web Worker runs single-threaded TensorFlow Lite WASM, keeping inference off the UI/audio threads; cross-origin isolation headers are not required. Only one inference is in flight. Audio is held in a bounded rolling buffer, transferred for processing, and cleared afterward. The model's SHA-256 is checked at build time and before loading in the browser. Failed integrity/loading checks, unsupported AI capture, inference errors/timeouts, or consistently slow inference trigger a visible spectral fallback. Trip scoring continues using that detector, and reports identify each event's actual detector and fallback reason.

The spectral detector still provides precise event boundaries: 48 logarithmic frequency bands from 120–6000 Hz, an adaptive RMS gate, at least three positive frames over 120 ms, and a 480 ms event separation gap. AI evidence enriches those events without changing sustained-honk merging. A likely personal match currently requires horn score ≥0.20, agreement with the best two personal embeddings ≥0.82, spectral similarity ≥0.75, and personal-versus-background margin ≥0.08. The displayed combined match is 65% embedding similarity and 35% spectral similarity. Other candidates remain **Uncertain**, conservatively preventing silent-crossing points. No model threshold is a validated ownership probability.

YAMNet is a free pretrained general sound classifier; Sonomend's private multisample matching, background comparison, coverage-aware scoring, and context review provide the personalization. Similar horns can still match. Short sounds, cabin noise, phone position, and device constraints can cause misses or false matches. Real-world accuracy is **not yet measured**. No events are labeled confirmed horns or proven unnecessary.

Model provenance, checksums, Apache-2.0 licensing, and the small reproducible graph change that exposes existing embeddings are documented in `public/models/README.md` and `THIRD_PARTY_NOTICES.md`. No retraining or model API is required. `npm run prepare:ai` builds/copies local runtime assets automatically before `npm run dev` and `npm run build`.

## Penalties, daily points and rewards (new trips)

- Two or more distinct likely horn detections whose starts are within five seconds produce **one penalty per burst**, anywhere in the trip. At least 480 ms separation is required; a sustained horn remains one event. A new burst begins after more than five seconds between detected starts. Microphone gaps cannot establish a repeat penalty.
- A complete observed crossing of an explicitly mapped **marked corner** or **road opening**, with uninterrupted microphone/GPS coverage and no horn detection, produces **one penalty**. Initial-inside, incomplete, uncertain-audio and interrupted crossings do not create a missing-horn penalty. The app does not infer unmapped road topology from GPS.
- A finished local calendar day with real tracked trips, usable monitoring and **zero penalties** earns **five points**, once. Startup sensor acquisition is excluded; later coverage gaps and unfinished crossings make the day ineligible. Today remains pending. Days without trips earn nothing.
- Each 100 accumulated points unlocks one reward; the dashboard shows total points and rewards. These are local game counters, not redeemable vouchers. Penalties block that day's bonus; they do not subtract previously earned points.
- Demo trips show practice penalties but never earn real daily points/rewards. The overview shows the last demo result separately. The three landing counters are real-trip penalties, points (the supplied “propers” label is preserved) and rewards.
- The scoring version is saved per trip. Earlier history keeps its legacy scoring and is excluded from new daily rewards. Rewards are recomputed from saved trip IDs, so reload/retry cannot duplicate an award. The scoring timezone is saved on this device.

Local zone JSON accepts unique id, name, latitude, longitude, radius (20–5000 meters), and type: quiet zone, marked corner, or road opening. At most 100 zones are accepted. Bundled zones are fictional Bengaluru demo markers, not official restrictions. Live trips use the current loaded zone snapshot; they cannot score missing horns at unmapped corners. Quiet zones no longer award individual crossing points under the new rules.

## Demo beside Calibrate

The landing **DEMO** button uses your saved horn calibration, a real microphone, and a fixed 60-second simulated route. It never requests real GPS. Without calibration, it opens calibration first; saving then starts the demo. A labeled local junction and permanent corner marker remain visible without online map services. Play one brief calibrated horn sound while the moving marker is inside the marked corner, near 44–49 seconds. Repeated sounds within five seconds count as a practice penalty. The route ends automatically and saves its report. The separately labeled scripted-audio option remains available in the lower demo controls for deterministic checks.

## Free static HTTPS deployment

`npm run build` generates `dist/`. It is self-contained; `base: './'` supports subdirectory hosting. Deploy **all contents** of `dist`, including `models/`, `ai-runtime/`, `pcm-worklet.js`, `zones.json`, `favicon.svg`, and `assets/`. No environment variables or secrets are required. The application requires no account; a hosting provider may require one for deployment.

For GitHub Pages (free for a public repository):

1. Keep app source on the development branch. Build locally or in CI with `npm ci && npm run build`.
2. Use GitHub Pages' static artifact deployment to publish the contents of `dist` (the standard `actions/upload-pages-artifact` / `actions/deploy-pages` flow), or put those contents on a dedicated `gh-pages` branch and select that branch in **Settings → Pages**. Do not overwrite source files with build output.
3. Enable HTTPS and test the resulting HTTPS site on Android Chrome. No SPA rewrite rule is needed because navigation stays in-page.

Any free static HTTPS host that serves the same directory works. Deployment was **not** performed by this task. An installed offline PWA/service worker is not included: app/model requests are local to the deployed origin, but a first load/reload still needs the static files. Online navigation additionally needs the map services. Completed history/calibration survive reload on that origin; browser storage clearing, eviction, private mode, or changing origin can remove/isolate them. An active trip is in memory until ended, with a navigation warning; force-closing the browser can lose it.

## Android test checklist — physical device still required

- Grant and deny both permissions; verify retry and HTTPS messaging. Confirm the live meter and usable GPS accuracy outdoors.
- Calibrate the actual vehicle while parked. For testing, use **new recordings not used during calibration** of (a) that horn, (b) a different horn, and (c) a siren or other distractor. Record device, volume/distance, background, match scores, missed detections, and false matches. Do not claim accuracy without a labeled evaluation.
- Play a sustained honk, then two distinct honks separated by at least 0.5 seconds; verify one versus two events. Very short honks below the minimum duration can be missed.
- Confirm the calibration screen saves all three personal AI fingerprints; test the visible spectral fallback with AI disabled.
- Rehearse the real-mic demo: clean Garden crossing, fresh horn playback at 44–46 seconds in Library, review item, and corner tag. If a distractor is loud enough, it may be uncertain or even match; document the result honestly.
- Repeat with GPS dropout. Then switch apps/lock the screen during a crossing, take a call, or disconnect a microphone. Verify interruption status, resume controls, and no point for the affected crossing.
- End the trip; verify Chrome's microphone indicator stops and GPS watcher ends. Reload and reopen the report. Confirm calibration and demo settings persist.
- While parked, verify real map tiles, a place search and a driving route on the deployed HTTPS site. Test on-screen turn changes, rerouting, arrival, poor GPS and network loss on a supervised route; no live-provider road validation has been completed.
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
| `src/route.ts`                 | Local SVG report sketch; does not bridge GPS gaps                          |
| `src/navigation/`              | Persistent Leaflet map, manual search, driving routes, GPS guidance        |
| `tests/`                       | Deterministic and browser checks                                           |

See `VERIFICATION.md` for the checks actually run and their limits.

## Optional parked sound check

Overview → Open optional sound check records a separate three-second WAV, allows local playback, and uploads only after explicit per-send consent. Clearing, hiding or leaving the page releases the microphone and clears the clip. It never changes calibration, events or points. Static hosts safely show the feature as unavailable. See [HOSTED_AI.md](HOSTED_AI.md) for server setup, privacy, limits and current verification.
## Landing design and 3D controls

The opening viewport follows the supplied annotated screenshot. Only gray texture and a pink cursor trail are used in its background. Text reveals rightward, the dashboard rises, and its labels reveal downward. The user's GLB is rendered as separate mesh objects, with no poster/video or backdrop rectangle. Capsules gently wiggle. A local cube reflection capture is visible during megaphone reveal/view movement and fades away when it settles; the wiggle alone does not reactivate reflections. This is a web material adjustment; the original .blend and GLB remain unchanged.

The 2.5-second authored reveal starts as soon as the GLB loads and holds the final pose. Drag the scene to rotate it; focus it and use arrow keys for rotation, Enter to replay, or Escape to restore the view. Reduced-motion preference starts at the final pose and suppresses animated text/trail. Three.js and fonts are served locally. The screenshot does not include editable font metadata, so Inter/Great Vibes are approximate matches.

## Room-demo release

The landing calibration flow treats repeats of your calibrated sound as Horn using local spectral matching (0.82 similarity threshold). General sound AI does not downgrade these sessions. Other sounds are ignored instead of appearing as uncertain events. This is a calibrated sound demonstration, not validated horn ownership detection.

The dashboard shows the active or most recent demo's penalties and proper mapped crossings, including after reload. Demo rewards stay at zero; the real-day ledger remains separate. Two distinct horns within five seconds produce one penalty per burst; a complete mapped corner crossing with no horn produces one penalty. Unobserved crossings remain unscored.

The original front screen is restored; the second dashboard page and scroll transition have been removed. Inline calibration includes Done / Next beside Cancel. Each click records the current short sample and advances after validation. Room-mode calibration does not load or wait for the optional AI classifier.


The public home is now the single 3D screen. Navigation opens in a square overlay with a smaller pin; close it to save the trip and return to the dashboard. Advanced diagnostic controls are available only at `/?tools`.
