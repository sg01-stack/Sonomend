# Sonomend project status

Updated 17 November 2026 (Asia/Kolkata).

## Active source

The GitHub Desktop clone at `C:\Users\sgs34\Documents\GitHub\Sonomend` is the working repository. It was clean on main at `8fe12ed89a6a421b99b4cf7cc8874cecbdd8b68d` before the tested continuation files were merged. Preserve this repository and its history for subsequent changes.

## Implemented

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
- Supply intended Figma/Blender assets for a custom visual pass.
- Choose/configure a public HTTPS deployment and verify the deployed application. No public deployment is claimed.
- Command-line GitHub authentication currently fails in the managed credential helper. GitHub Desktop may provide an independent authenticated push path; confirm remote state after any push. Do not claim local commits are synced.

## Last continuation evidence

43 unit tests, 11 Node API tests and 17 production-browser tests passed before merge. Model integrity/build and Worker deployment dry run passed. Separate actual browser requests to OpenStreetMap tiles, Nominatim search and OSRM routing succeeded. The desktop clone is revalidated when preparing the active development checkpoint.

Desktop-clone validation completed 17 November 2026: npm ci, npm run check (43 unit + 11 backend + 17 browser tests), strict build/model integrity, and Worker dry run all passed. Local frontend and API HTTP checks passed; hosted AI reports disabled as expected.
