# Optional hosted sound check

This is a separate parked, manual second opinion about general horn evidence. It never changes personal matching or trip scores, never uploads trip/calibration audio, and is disabled by default. The core remains a static, local app.

## Local setup

Requires Node 22.12+. `npm ci`, then `npm run build` and `npm start` serves the app and API at http://127.0.0.1:8787. For frontend development, run `npm run dev:api` in one terminal and `npm run dev` in another: Vite proxies `/api/hosted` without changing the browser Origin.

Copy `.env.example` to ignored `.env`. Set a server-only `SONOMEND_GEMINI_KEY` through a local secret editor or hosting secret store, never chat or source control. Select `SONOMEND_GEMINI_MODEL` explicitly: it must support audio input and structured JSON through generateContent. Only set `SONOMEND_HOSTED_ENABLED=true` and `SONOMEND_FREE_TIER_CONFIRMED=true` after verifying that exact project/model is eligible for free use and billing is disabled. Never put keys in VITE_ variables. This flag does not enforce billing policy or guarantee free availability.

Behind an HTTPS reverse proxy, set `SONOMEND_PUBLIC_ORIGIN=https://your-exact-host` and keep the Node listener private. Forwarded scheme/host headers are intentionally not trusted. `HOST` defaults to loopback; change it only for the deployment topology. Static-only hosting needs no secrets and displays a safe unavailable state for the optional page.

## Worker option

Wrangler 4.163.0 is pinned. `npm run build && npm run check:worker` validates bundling without deploying. `wrangler.jsonc` serves every dist asset and routes the API through the Worker. Configure the key as a Worker secret and non-secret flags/model as vars; `.dev.vars` is ignored. Keep the flags false until configuration is verified. No Cloudflare account, deployment, or public URL was established in this continuation.

If a restricted workspace disallows Wrangler's default config/log folders, set XDG_CONFIG_HOME and WRANGLER_LOG_PATH to writable workspace directories. No elevated execution is needed.

## Privacy and limits

The browser captures exactly 48,000 samples at 16 kHz with a separate AudioWorklet; unsupported sample rates fail explicitly. It stops the microphone after capture, on interruption, page hide, navigation or clear. Late microphone permission resolves into an immediate track stop if the page was left. The WAV and playback URL exist in memory only. Each send needs consent, and there is no automatic retry. Leaving/clearing aborts pending requests but cannot recall audio already received by the provider. Server code does not log or persist raw clips. Hosting infrastructure may have its own logging policies; do not log request bodies.

The API accepts only bounded JSON with consent and canonical mono 16-bit 16 kHz PCM WAV of 1–4 seconds. It checks browser origin, validates model output, uses a server-side key, times out provider calls, and returns no-store JSON. Node serves only dist, with realpath containment, hidden-path rejection and MIME handling.

Limits are one in-flight request, 30 seconds between requests, and 40 requests per UTC day **per running instance**. They reset on restart and are not distributed enforcement, authentication or a billing guarantee. A public endpoint can consume the shared quota; keep any enabled demo access-controlled at the host. Do not enable a publicly scalable cloud service based on these counters alone.

## Official documentation checked 17 November 2026

- [GenerateContent API](https://ai.google.dev/api/generate-content) still documents `/v1beta/models/{model}:generateContent`, audio input and JSON responses. The adapter uses inline WAV and a constrained response schema. No credential-backed request has been run.
- [Pricing](https://ai.google.dev/gemini-api/docs/pricing) varies by model and project. No model is preselected; recheck availability, retirement/automatic routing notices and pricing before enabling.
- [Data terms](https://ai.google.dev/gemini-api/terms): unpaid inputs/outputs may be used to improve Google products and reviewed by humans. The consent UI discloses this. Avoid sensitive/private recordings. Review age, region and intended-use restrictions before offering this optional service to users; some regions require paid services and therefore cannot use this free-only configuration.

## Validation boundaries

The Node handler, adapter and frontend are tested using synthetic audio and controlled provider responses. Actual Google credentials, eligible model/project, live inference quality and physical Android behavior remain unverified. No billing was enabled. No Figma/Blender files were integrated.
