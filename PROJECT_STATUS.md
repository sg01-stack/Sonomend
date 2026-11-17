# Sonomend project status

Updated 17 November 2026 (Asia/Kolkata).

## Active source

The GitHub Desktop clone at `C:\Users\sgs34\Documents\GitHub\Sonomend` is the working repository. It was clean on main at `8fe12ed89a6a421b99b4cf7cc8874cecbdd8b68d` before the tested continuation files were merged. Preserve this repository and its history for subsequent changes.

## Implemented

- Latest landing revision: stronger transparent capsule contours and neutral white studio highlights, with megaphone reflections only during reveal/interaction. One-step inline calibration under either landing button, immediate mic request, automatic save/start after three accepted samples, and authored pin-only GLB over the persistent live map. Pin stays centered; map follows real or simulated positions. Original map placeholder/video is not used. Street tiles retain per-trip opt-in.

- Existing vehicle calibration, bundled local YAMNet/personal matching, coverage-aware trip scoring, history and integrated opt-in navigation.
- Separate optional parked sound check: three-second recording, local playback, per-send consent, cancel/clear, interruption/late-permission cleanup and safe result display. No scoring changes.
- Node and Worker API adapters, bounded WAV/body validation, origin checks, server-only key, timeouts, provider error handling and per-instance request limits.
- Safe disabled defaults, ignored secret files, setup/privacy documentation and pinned Wrangler dry-run tooling.
- Portable production-test runner with a fresh local server and available port.

## Daily development

`npm run dev` starts the frontend at http://localhost:5173. For optional API development, run `npm run dev:api` in another terminal; Vite proxies API requests to localhost:8787. After `npm run build`, `npm start` serves the production app and API at http://localhost:8787. The optional hosted service stays disabled unless explicitly configured. Use HTTPS for phone microphone testing.

`npm run check` is the release validation command. `npm run check:worker` only validates Worker packaging. See VERIFICATION.md and HOSTED_AI.md for scope and limitations.

## Remaining product work / dependencies

- Configure an eligible free-tier provider project/model and server secret securely if the optional hosted feature is wanted. No live Google inference has been verified; no billing enabled.
- Physical Android/vehicle validation: fresh horn/distractor samples, noise, GPS drift, real directions, interruptions and battery behavior. Simulation results are not real-world accuracy.
- Annotated screenshot and megaphone GLB supplied and integrated. Editable Figma source/font specifications are not supplied; current script font is a locally bundled visual approximation.
- Choose/configure a public HTTPS deployment and verify the deployed application. No public deployment is claimed.
- Command-line GitHub authentication currently fails in the managed credential helper. GitHub Desktop may provide an independent authenticated push path; confirm remote state after any push. Do not claim local commits are synced.

## Last continuation evidence

43 unit tests, 11 Node API tests and 17 production-browser tests passed before merge. Model integrity/build and Worker deployment dry run passed. Separate actual browser requests to OpenStreetMap tiles, Nominatim search and OSRM routing succeeded. The desktop clone is revalidated when preparing the active development checkpoint.

Desktop-clone validation completed 17 November 2026: npm ci, npm run check (43 unit + 11 backend + 17 browser tests), strict build/model integrity, and Worker dry run all passed. Local frontend and API HTTP checks passed; hosted AI reports disabled as expected.

## Approved landing design

First viewport follows the supplied screenshot: Sonomend title/tagline at upper left; authored megaphone + six glass capsules in central marked area; CALIBRATE below; burgundy dashboard at lower right with unchanged labels. Slow clipped title/tagline reveal rightward, dashboard reveal upward, labels downward. Background is gray crosshatch with fading pink pointer trail only (rectangles explicitly rejected). GLB bytes are unchanged; its 2.5-second animation plays once and holds. Reduced motion disables the reveal and trail. Existing app controls remain below the opening viewport; calibration is wired to the existing flow. Inter and Great Vibes fonts are served locally, approximating the screenshot pending editable Figma/font details.

3D revision: no poster/video or rectangular backdrop. Separate imported meshes retained; capsules use transparent non-transmissive material to avoid the megaphone image/reflection. Drag rotates view; arrow keys rotate, Enter replays and Escape resets. First-frame negative-delta clamp fixed; automatic reveal and hold now tested.

## Current scoring and visual revision

New trips save scoringVersion 2. Two or more distinct likely horns in five seconds produce one penalty per burst, globally. Complete mapped corner/road-opening crossings with no detection produce one penalty; missing/ambiguous coverage is unscored. Completed tracked real days with zero penalties earn five points, each 100 points unlocks one local reward. Legacy history is preserved. Demo uses calibrated microphone and simulated GPS; practice rewards are excluded. Landing counters derive from saved real trips and refresh across day boundaries. Demo's last practice result is shown separately below the landing. Capsules wiggle gently; reflections turn on during reveal/interaction and fade when the megaphone/view settles.

Latest room-demo release: calibrated spectral sound matching bypasses general sound classification for landing-started sessions; latest demo penalties/proper crossings appear in the landing and second-page dashboard and survive reload. Added procedural concrete second section and rough scroll edge. Original user map ZIP pin hash matches the integrated GLB. Render static deployment preparation uses Node 24.22.0, npm ci/build, dist. Physical room/phone validation is still needed; synthetic audio tests do not establish real-world accuracy.

18 November correction: removed the second-page/scroll redesign and restored the previous opening screen. Added Done / Next alongside Cancel. Landing calibration now uses only local spectral capture, avoiding an unnecessary AI startup/settle dependency. Live Render URL: https://sonomend.onrender.com. Demo scoring and saved dashboard results are retained.
