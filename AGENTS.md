# Sonomend working instructions

## Project and workflow

This repository is the active Sonomend product source. Continue the existing application; do not rebuild it from scratch. Read PROJECT_STATUS.md, README.md and package.json before substantial work. Check git status and preserve user changes. The continuation archive under Documents/Codex is historical, not the source of truth.

Use plain TypeScript, CSS and Vite. Keep the existing mobile layout and CSS variables easy to restyle. Do not introduce a new framework without a concrete requirement. The user supplied an annotated screenshot and megaphone GLB on 17 November 2026. Preserve its layout, wording and approved directional reveals. Background is ONLY gray texture and pink cursor trail; no pink rectangles. Do not assume unrelated local assets belong to it.

Implement requested changes, run relevant checks, update documentation, and report actual results and remaining blockers. Do not describe the full product as finished merely because tests pass. Keep a local commit checkpoint after completing a verified change when consistent with the user's request; never force-push or reset away work. External publication/access changes require authorization from the conversation, not this file.

## Product invariants

- Core calibration, personal horn matching, trip recording and scoring work locally without accounts, secrets, backend or cloud AI.
- Hosted sound check is optional, off by default, parked/manual, and requires explicit upload consent. Never send trip/calibration audio or use hosted results to rewrite ownership labels or scores. Never expose provider keys in frontend code or VITE_ variables.
- Keep raw clips temporary. Release microphone, GPS, workers, timers and requests on session end; handle late permission and cancellation.
- Preserve coverage-aware scoring, historical trip settings and IndexedDB compatibility. Missing/uncertain coverage cannot earn quiet-zone points.
- Keep the live map mounted across UI updates, and reuse the trip's GPS watcher.
- Online maps are per-trip opt-in. Do not claim measured real-world horn accuracy, proven ownership or unnecessary honking.

## Validation

Node 22.12+ required. Run `npm ci`, then `npm run check` for changes affecting app behavior. This runs unit tests, Node backend tests, strict TypeScript/build/model integrity and production-browser checks. The production runner owns an ephemeral local port and shuts down its server. Set CHROMIUM_PATH if the default Chrome/Chromium executable is absent.

Run `npm run check:worker` after deployment adapter/config changes. This is a dry run, not a deployment. Do not enable billing or silently choose a paid model. Check current provider terms and exact project/model eligibility before enabling hosted AI.

Never include .env, .dev.vars, credentials, node_modules, generated runtime or dist in source commits. Record validation and current blockers in PROJECT_STATUS.md. Distinguish local commit, GitHub push, deployable build and public deployment.
