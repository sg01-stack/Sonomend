# Sonomend — hackathon demo ready

This release is ready for a controlled demo of **Calibrate & Start → live GPS map + horn monitoring + points → saved report**. The scripted rehearsal works without a microphone, movement, an API key, or external map services. Real vehicle-recognition accuracy and live road navigation still need a physical phone field test.

## Start the app

```sh
npm ci
npm run check
npm run dev
```

`npm run check` runs logic/storage tests, builds the static app and runs the complete browser suite against that production build. `npm run preview` serves the built app at `http://localhost:4173`. A phone needs an HTTPS deployment for microphone/location access.

The deployable bundle contains the contents of `dist/`, including the model, WASM runtime, licenses, zones and assets. Extract it to a free static HTTPS host. Opening `index.html` directly with `file://` will not work. No API key or server is required for this release.

## Rehearse the pitch in 60 seconds

1. Open Overview. Under Demo Trip, select **Simulated audio · deterministic test**.
2. Leave GPS dropout and three-honk simulation off. Start the demo.
3. Show the moving position, demo zones and points on the integrated map. This route and audio are visibly labeled simulations.
4. Garden earns one quiet-crossing point. The Library detection becomes a review item with corner context. At 60 seconds, the report shows **1 net point** and is saved locally.
5. Reload and reopen the saved report. For a second run, enable three-honk simulation: +1 Garden point and −1 repeated-honk deduction produce **0 net points**. Turn three-honk simulation off before a dropout run: it produces **0 points** because affected coverage cannot earn a point.

Pitch: “Sonomend learns a private fingerprint of your horn, combines it with free on-device sound AI, and brings horn awareness, transparent quiet-zone points and basic GPS directions into one screen.” Similar horns can match; this is not proof of who honked or why.

## Live trip walkthrough

While parked, choose **Calibrate & Start**, enable the microphone, sample background and three separate honks, then **Save & Start Trip**. The same microphone continues into the trip and one GPS watcher serves navigation and scoring. Later trips can use the saved calibration.

Enable online maps to get streets, search for a destination or enter `latitude, longitude`, and select a result. Free public OpenStreetMap/Nominatim/OSRM services receive map areas, searches and route coordinates; audio remains on-device. Instructions follow your GPS, off-route fixes trigger a reroute, and weak/stale GPS pauses directions. The map and destination input stay mounted while scores refresh. End Trip releases sensors and saves the report.

## Release boundaries

- Navigation is a foreground visual prototype with no live traffic, voice directions or offline street maps. Public map-provider responses were simulated in automated checks because this cloud environment blocks those hosts. The three required domains are saved in the environment configuration draft, not applied or published. Review/save those settings and publish when you choose to enable them here.
- No public website was deployed. Physical Android testing and actual map-provider connectivity are still outstanding; see `README.md` and `VERIFICATION.md`.
- The earlier optional hosted-AI add-on is not included: all sound AI in this release runs on-device. No free-tier provider credentials are configured.
- Custom Figma/Blender assets have not been supplied. For that visual pass, provide a Figma file or shareable design link and the Blender `.blend` file or a web-ready `.glb` export, including any required textures.
