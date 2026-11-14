import "./style.css";
import { Microphone } from "./audio";
import { fingerprint, SpectralDetector } from "./detector";
import { HornAi } from "./ai/client";
import {
  MODEL_ID,
  matchWithAi,
  selectCalibrationFrame,
  spectralFallback,
  type AiFrame,
} from "./ai/matching";
import { demoFix, demoStage, scriptedFrame, validateZones } from "./demo";
import { scoreCrossings, TripEngine, MAX_ACCURACY } from "./trip";
import * as storage from "./storage";
import { scoreTrip } from "./scoring";
import { routeSvg } from "./route";
import type {
  Calibration,
  Detection,
  Frame,
  Settings,
  Trip,
  TripMode,
  Zone,
} from "./types";

const app = document.querySelector<HTMLDivElement>("#app")!;
const mic = new Microphone();
const ai = new HornAi();
const pendingEvents = new Set<Promise<void>>();
let noiseEmbedding: number[] | undefined;
const aiEnabled = () => settings.aiEnabled !== false;
const personalized = () => calibration?.ai?.modelId === MODEL_ID;
const detectorName = () =>
  aiEnabled() && personalized()
    ? "YAMNet + personal matching"
    : "Spectral matching";
let page: "home" | "calibrate" | "live" | "report" | "history" = "home";
let calibration: Calibration | undefined,
  latest: Trip | undefined,
  report: Trip | undefined;
let history: Trip[] = [];
let settings: Settings = { matchThreshold: 0.9, demoDropout: false };
let zones: Zone[] = [];
let error = "",
  notice = "",
  busy = false,
  zoneReady = false;
let engine: TripEngine | undefined, detector: SpectralDetector | undefined;
let tripTimer: ReturnType<typeof setInterval> | undefined,
  demoTimer: ReturnType<typeof setInterval> | undefined,
  watchId: number | undefined;
let micMessage = "Microphone off",
  gpsMessage = "Waiting for a position",
  level = 0;
let noise: number | undefined,
  samples: ({ vector: number[]; level: number; ai?: AiFrame } | undefined)[] = [
    undefined,
    undefined,
    undefined,
  ];
let capture:
  | {
      kind: "noise" | number;
      frames: Frame[];
      start: number;
      end: number;
      interrupted: boolean;
    }
  | undefined;
let captureTimer: ReturnType<typeof setTimeout> | undefined;
let wakeLock: WakeLockSentinel | undefined;
let demoAudio = "mic";
let savePending: Trip | undefined;
const esc = (x: unknown) =>
  String(x).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const clock = (ms: number) =>
  `${Math.floor(ms / 60000)
    .toString()
    .padStart(2, "0")}:${Math.floor((ms / 1000) % 60)
    .toString()
    .padStart(2, "0")}`;
const date = (t: number) =>
  new Date(t).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
const time = (t: number) =>
  new Date(t).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
const icon = (name: string, cls = "") =>
  `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${({ sound: '<path d="M3 12h2m4-5v10m3-14v18m3-14v10m4-5h2"/>', arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>', shield: '<path d="m12 3 8 4v5c0 5-8 9-8 9s-8-4-8-9V7z"/><path d="m8 12 3 3 5-6"/>', mic: '<rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/>', pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>', leaf: '<path d="M20 3C8 1 1 9 5 16s18 1 15-13Z"/><path d="m3 22 11-12"/>', history: '<path d="M3 5v5h5M3 10a9 9 0 1 1 1 8"/><path d="M12 7v5l3 2"/>', home: '<path d="m3 10 9-7 9 7v11H3Z"/><path d="M9 21v-8h6v8"/>', check: '<path d="m5 12 4 4L19 6"/>', play: '<path d="m8 4 12 8-12 8Z"/>', stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>', alert: '<path d="m12 3 10 18H2Z"/><path d="M12 9v4m0 4h.01"/>', chevron: '<path d="m9 5 7 7-7 7"/>' } as Record<string, string>)[name] ?? ""}</svg>`;
const button = (
  label: string,
  action: string,
  kind = "primary",
  disabled = false,
) =>
  `<button class="button ${kind}" data-action="${action}" ${disabled ? "disabled" : ""}>${label}</button>`;

function shell(content: string) {
  app.innerHTML = `<header class="header"><a href="#" class="brand" data-action="home"><span class="brand-icon">${icon("sound")}</span>sonomend<span class="brand-dot">.</span></a><nav aria-label="Main navigation">${[
    ["home", "Overview", "home"],
    ["calibrate", "Calibration", "mic"],
    ["history", "Trip history", "history"],
  ]
    .map(
      ([p, label, i]) =>
        `<button data-action="${p}" class="nav-item ${page === p ? "active" : ""}" ${page === "live" || busy ? "disabled" : ""}>${icon(i)}<span>${label}</span></button>`,
    )
    .join(
      "",
    )}</nav><span class="local-badge">${icon("shield")} On-device & private</span></header><main>${error ? `<div role="alert" class="message error">${icon("alert")}<span>${esc(error)}</span>${button("Dismiss", "dismiss", "text-button")}</div>` : ""}${notice ? `<div role="status" class="message">${esc(notice)}</div>` : ""}${content}</main><footer><span>Small signals. More mindful journeys.</span><span>Built for awareness, not judgment.</span></footer>`;
  app.querySelectorAll<HTMLElement>("[data-action]").forEach((el) =>
    el.addEventListener("click", (e) => {
      e.preventDefault();
      void action(el.dataset.action!);
    }),
  );
  app
    .querySelector<HTMLSelectElement>("#demo-audio")
    ?.addEventListener("change", (e) => {
      demoAudio = (e.target as HTMLSelectElement).value;
      render();
    });
  app
    .querySelector<HTMLInputElement>("#dropout")
    ?.addEventListener("change", async (e) => {
      settings.demoDropout = (e.target as HTMLInputElement).checked;
      try {
        await storage.saveSettings(settings);
      } catch {
        fail(
          "Could not save demo settings. Browser storage may be unavailable.",
        );
      }
    });
  for (const [id, key] of [
    ["repeat-penalty", "repeatPenalty"],
    ["demo-repeats", "demoRepeats"],
  ] as const) {
    app
      .querySelector<HTMLInputElement>("#" + id)
      ?.addEventListener("change", async (e) => {
        settings[key] = (e.target as HTMLInputElement).checked;
        try {
          await storage.saveSettings(settings);
        } catch {
          fail("Could not save scoring settings.");
        }
      });
  }
  app
    .querySelector<HTMLInputElement>("#ai-enabled")
    ?.addEventListener("change", async (e) => {
      settings.aiEnabled = (e.target as HTMLInputElement).checked;
      ai.stop();
      try {
        await storage.saveSettings(settings);
        render();
      } catch {
        fail("Could not save AI preference.");
      }
    });
  app
    .querySelector<HTMLInputElement>("#zones-file")
    ?.addEventListener("change", async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        if (file.size > 100000)
          throw new Error("Zone file is too large. Maximum size is 100 KB.");
        zones = validateZones(JSON.parse(await file.text())) as Zone[];
        zoneReady = true;
        notice = `Loaded ${zones.length} zones for real trips in this session. Demo trips always use the bundled demo zones.`;
        render();
      } catch (e) {
        fail(e);
      }
    });
  updateMeter();
}
function render() {
  shell(
    page === "home"
      ? home()
      : page === "calibrate"
        ? calibrate()
        : page === "live"
          ? live()
          : page === "history"
            ? historyView()
            : reportView(),
  );
}
function home() {
  const totals = latest ? scoreCrossings(latest) : [];
  return `<section class="hero"><div class="hero-copy"><p class="eyebrow"><span class="tiny-dot"></span> A LITTLE AWARENESS GOES A LONG WAY</p><h1>A quieter way<br><em>forward.</em></h1><p>Get to know your horn habits. A simple companion to listen, reflect, and make every trip a little more mindful.</p><div class="hero-actions">${button(`Start a trip ${icon("arrow")}`, "start", "lime", busy || !calibration || !zoneReady)}<span>${calibration ? "Your horn is calibrated. You’re set." : "First, let’s get to know your horn."}</span></div></div><div class="signal-art" aria-hidden="true"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><div class="orbit orbit-three"></div><div class="art-label top">LESS NOISE. MORE AWARENESS.</div><div class="signal-core">${icon("sound")}</div><div class="signal-tag">${icon("leaf")} Room for a quieter road</div><span class="orbit-dot dot-one"></span><span class="orbit-dot dot-two"></span></div></section>
  <div class="section-title"><div><p class="eyebrow">YOUR STARTING POINT</p><h2>A little setup. A better picture.</h2></div><span class="pill">${detectorName()}</span></div>
  <section class="setup-grid"><article class="card calibration-card"><div class="card-heading"><span class="icon-tile">${icon("mic")}</span><span class="pill ${calibration ? "success" : ""}">${calibration ? "Calibrated" : "Step 01"}</span></div><h3>${calibration ? "Your horn, recognized." : "Your horn, your baseline."}</h3><p>${calibration ? `Three fingerprints saved on ${date(calibration.createdAt)}. Recalibrate if your vehicle, phone, or mic position changes.` : "While safely parked, capture the background and three short honks. About 30 seconds to get started."}</p>${button(`${calibration ? "Recalibrate" : "Calibrate my horn"} ${icon("arrow")}`, "calibrate", "outline", busy)}</article><article class="card how-card"><p class="eyebrow">THE JOURNEY</p><ol class="steps"><li><span>01</span><div><strong>Calibrate</strong><small>Give your horn a local fingerprint.</small></div></li><li><span>02</span><div><strong>Take a trip</strong><small>Keep the app visible. Let it listen.</small></div></li><li><span>03</span><div><strong>Look back</strong><small>See detections, context, and quiet crossings.</small></div></li></ol></article></section>
  <section class="latest-section"><div class="section-title"><h2>Your last journey</h2>${latest ? button("View report " + icon("arrow"), "latest", "text-button") : ""}</div><div class="stats-grid"><div class="stat"><span>Likely your horn</span><strong>${latest ? latest.events.filter((e) => e.label === "Likely your horn").length : "—"}</strong><small>Matches, not proof of ownership</small></div><div class="stat"><span>Quiet crossings</span><strong>${latest ? totals.filter((c) => c.outcome === "Point earned").length : "—"}</strong><small>Complete, with clear coverage</small></div><div class="stat accent"><span>Net points</span><strong>${latest ? scoreTrip(latest).totalPoints : "—"}<span>${icon("leaf")}</span></strong><small>${latest ? date(latest.startedAt) : "Your first journey starts here"}</small></div></div></section>
  <section class="card ai-card"><div><p class="eyebrow">FREE · PRIVATE · PERSONAL</p><h2>Your horn, with a second check.</h2><p>YAMNet checks for horn-like sounds. Your three private sound fingerprints help decide whether the sound resembles your vehicle. Similar horns can still match.</p><small>${personalized() ? "Your personal AI fingerprint is saved on this device." : "Recalibrate with AI enabled to create your personal AI fingerprint. Existing calibration still works in Spectral matching."}</small></div><label class="checkbox"><input id="ai-enabled" type="checkbox" ${aiEnabled() ? "checked" : ""}> Use free on-device AI</label><label class="checkbox"><input id="repeat-penalty" type="checkbox" ${settings.repeatPenalty !== false ? "checked" : ""}> Apply repeat-honk deductions</label><small>Three separate likely matches within 10 seconds in a complete quiet-zone crossing deduct one point, at most once per crossing. Missing coverage prevents deductions. A review rule, not proof of unnecessary honking.</small></section><section class="card demo-card"><div><span class="eyebrow">TRY IT BEFORE THE ROAD</span><h2>A short route. A real rehearsal.</h2><p>60 seconds through two <strong>demo quiet zones</strong> and a marked corner. Simulated GPS; real microphone by default.</p></div><div class="demo-controls"><label for="demo-audio">Demo audio</label><select id="demo-audio"><option value="mic" ${demoAudio === "mic" ? "selected" : ""}>Real microphone (calibration required)</option><option value="scripted" ${demoAudio === "scripted" ? "selected" : ""}>Simulated audio · deterministic test</option></select><label class="checkbox"><input type="checkbox" id="dropout" ${settings.demoDropout ? "checked" : ""}> Simulate GPS dropout in first zone</label><label class="checkbox"><input type="checkbox" id="demo-repeats" ${settings.demoRepeats ? "checked" : ""} ${demoAudio !== "scripted" ? "disabled" : ""}> Simulate three separate honks (scripted audio)</label>${button(`${icon("play")} Start demo trip`, "demo", "outline", busy || !zoneReady || (demoAudio === "mic" && !calibration))}<small>${demoAudio === "mic" ? "Stay quiet in Garden; play your calibrated horn in Library." : "Clearly labeled test inputs. No microphone or real GPS used."}</small></div></section>
  <section class="privacy-strip">${icon("shield")}<div><strong>Your data stays in your browser.</strong><p>Audio is processed and discarded. Fingerprints and trips stay in IndexedDB. No accounts, uploads, or paid services.</p></div></section><details class="details"><summary>Permissions, demo zones & limitations</summary><p>Use HTTPS on your phone and allow microphone and location access. Keep the app visible and your phone mounted; do not interact while driving. Only calibrate where it is safe and permitted.</p><p>Spectral matching compares sound fingerprints. Similar horns, sirens, and other loud sounds can match. A match score is not the probability that you honked. Quiet points are a local reflection tool, not a measure of driving safety.</p><p>Bundled zones are fictional demo markers in Bengaluru, not official restrictions or inferred corners. Real trips use these markers unless you load your own zone JSON. Edit <code>public/zones.json</code> before deployment or load a file below for this session.</p><label class="file-label">Load local zones (.json)<input id="zones-file" type="file" accept=".json,application/json"></label><p>${zones.length} zones loaded. GPS must be ≤ ${MAX_ACCURACY} m accuracy and ≤ 5 seconds old. Missing coverage cannot earn points.</p></details>`;
}
function calibrate() {
  const done = samples.every(Boolean),
    next = noise === undefined ? "noise" : samples.findIndex((s) => !s);
  return `<div class="page-heading"><p class="eyebrow">STEP 01 · SAFELY PARKED</p><h1>Meet your horn.</h1><p>A short background sample, then three separate honks. Use the phone position you’ll use during your trip.</p></div><section class="cal-layout"><article class="card"><div class="card-heading"><h2>Listen & learn</h2><span class="pill">${ai.ready ? "YAMNet + personal matching" : "Spectral matching"}</span></div><p class="small muted" role="status">${aiEnabled() ? esc(ai.reason) : "AI disabled · using Spectral matching"}</p><div class="meter-panel">${icon("mic")}<strong id="mic-label">${esc(micMessage)}</strong><div class="meter"><div id="mic-meter"></div></div><small>Live microphone level</small></div>${!mic.running ? button(`${icon("mic")} Enable microphone / retry`, "enable-mic", "primary", busy) : ""}<div class="sample-list"><div class="sample-row"><span class="step-circle ${noise !== undefined ? "complete" : ""}">${noise !== undefined ? icon("check") : "0"}</span><div><strong>Background noise</strong><small>Keep quiet for 2 seconds.</small></div>${noise !== undefined ? button("Redo", "capture-noise", "text-button", !!capture) : ""}</div>${samples.map((s, i) => `<div class="sample-row"><span class="step-circle ${s ? "complete" : ""}">${s ? icon("check") : i + 1}</span><div><strong>Short honk ${i + 1}</strong><small>${s ? (s.ai ? "Personal AI + spectral fingerprint captured." : "Spectral fingerprint captured; AI sample unavailable.") : "One brief honk during a 3-second sample."}</small></div>${s ? button("Redo", `capture-${i}`, "text-button", !!capture) : ""}</div>`).join("")}</div><div class="capture-area" aria-live="polite">${capture ? `<strong>${capture.kind === "noise" ? "Stay quiet. Sampling background…" : "Honk once now. Listening…"}</strong><p id="capture-countdown"></p>` : done ? `<p>All three fingerprints are ready.</p>${button("Save calibration " + icon("check"), "save-calibration", "primary", busy)}` : button(`${next === "noise" ? "Sample background · 2 sec" : `Record honk ${Number(next) + 1} · 3 sec`} ${icon("arrow")}`, `capture-${next}`, "primary", !mic.running || busy)}</div></article><aside class="card guidance"><span class="icon-tile">${icon("shield")}</span><h3>A fingerprint, not an identity.</h3><p>YAMNet checks for horn-like sounds, then we compare AI embeddings and frequency patterns with your samples. With AI unavailable, spectral comparison remains active. A strong match is labeled <strong>“Likely your horn.”</strong></p><p>Similar horns from other vehicles may match. Ambiguous loud sounds are labeled <strong>“Uncertain.”</strong> No sound is labeled a confirmed horn.</p><div class="note">Park safely. Keep your speaker volume and microphone position consistent. Avoid unnecessary horn use.</div><p class="small">Only spectral fingerprints and personal AI embeddings are saved. Short audio windows exist only in memory during processing; raw audio is never saved or uploaded.</p></aside></section>`;
}
function live() {
  if (!engine) return "";
  const t = engine.trip,
    elapsed = Date.now() - t.startedAt,
    scored = scoreCrossings(t),
    isDemo = t.mode !== "live";
  const micOk = t.mode === "demo-scripted" || engine.available("mic"),
    gpsOk = engine.available("gps");
  return `<div class="live-header"><span class="pill ${micOk && gpsOk ? "success" : "warning"}"><span class="tiny-dot"></span>${isDemo ? "DEMO TRIP" : "LIVE TRIP"}</span><span class="muted">${t.mode !== "demo-scripted" && ai.ready && personalized() ? "YAMNet + personal matching" : "Spectral matching"}</span></div>${isDemo ? `<div class="demo-banner">${t.mode === "demo-scripted" ? "SIMULATED AUDIO + GPS · deterministic test, no microphone" : "SIMULATED GPS · real microphone and detector"}${settings.demoDropout ? " · GPS dropout enabled" : ""}</div>` : ""}${t.mode !== "demo-scripted" && aiEnabled() && personalized() && !ai.ready ? `<div class="message" role="status">${esc(ai.reason)}</div>` : ""}<section class="live-main"><p class="eyebrow">${micOk && gpsOk ? "LISTENING TO THE JOURNEY" : "COVERAGE NEEDS ATTENTION"}</p><h1 class="timer">${clock(elapsed)}</h1><p>${isDemo ? esc(demoStage(elapsed)) : "Keep this screen visible. Stay focused on the road."}</p><div class="live-signal" aria-hidden="true">${Array.from({ length: 21 }, (_, i) => `<i style="--bar:${20 + Math.sin(i * 2.1) ** 2 * 60}%"></i>`).join("")}</div><div class="status-row"><span class="status ${micOk ? "ok" : "bad"}">${icon("mic")}${t.mode === "demo-scripted" ? "Simulated audio" : micOk ? "Microphone active" : "Microphone interrupted"}</span><span class="status ${gpsOk ? "ok" : "bad"}">${icon("pin")}${gpsOk ? (isDemo ? "Demo GPS · ±5 m" : esc(gpsMessage)) : "GPS interrupted"}</span></div>${!micOk ? `<p class="warning-text">${esc(micMessage)}. This interval cannot earn quiet points.</p>${button("Resume microphone", "resume-mic", "outline", busy)}` : ""}${!gpsOk ? `<p class="warning-text">${esc(gpsMessage)}. Crossings with missing GPS remain unscored.</p>${t.mode === "live" ? button("Retry GPS permission", "retry-gps", "outline") : ""}` : ""}</section><div class="stats-grid live-stats"><div class="stat"><span>Likely your horn</span><strong>${t.events.filter((e) => e.label === "Likely your horn").length}</strong></div><div class="stat"><span>Uncertain</span><strong>${t.events.filter((e) => e.label === "Uncertain").length}</strong></div><div class="stat accent"><span>Net points</span><strong>${scoreTrip(t).totalPoints}</strong></div></div><div class="end-area">${button(`${icon("stop")} End trip & see report`, "end", "primary", busy)}<small>Stops microphone and GPS. Saves this trip on your device.</small></div><div class="note">Foreground use only. Locking your phone, switching apps, stale positions, or audio interruptions exclude affected crossings from scoring. Context labels never establish why someone honked.</div>`;
}
function reportView() {
  const t = report;
  if (!t) return "<p>No report saved yet.</p>";
  const crossings = scoreCrossings(t),
    points = scoreTrip(t).totalPoints;
  const zoneName = (id: string) => t.zones.find((z) => z.id === id)?.name ?? id;
  const rows = [
    ...t.events.map((e) => ({
      at: e.start,
      html: `<span class="timeline-icon ${e.review ? "warm" : ""}">${icon("sound")}</span><div><div class="event-title"><strong>${e.label}</strong><span class="pill ${e.review ? "warning" : ""}">${e.review ? "Review" : e.label === "Uncertain" ? "Uncertain candidate" : "Detected"}</span></div><p>${Math.round(e.match * 100)}% match score · ${esc(e.detectorMode ?? "Spectral matching")} · ${e.location ? `GPS ±${Math.round(e.location.accuracy)} m` : "Unlocated · no recent, accurate GPS"}</p>${e.ai ? `<p class="small">Horn model score ${Math.round(e.ai.hornScore * 100)}% · personal embedding match ${Math.round(e.ai.embeddingMatch * 100)}% · spectral match ${Math.round(e.ai.spectralMatch * 100)}%</p>` : ""}${e.fallbackReason ? `<p class="small">${esc(e.fallbackReason)}</p>` : ""}<small>${e.zoneIds.length ? e.zoneIds.map((id) => esc(zoneName(id))).join(" · ") : "No zone score"}${e.nearCorner ? " · Near marked corner" : ""}${e.simulated ? " · Simulated audio" : ""}</small></div>`,
    })),
    ...scoreTrip(t).repeats.map((r) => ({
      at: r.start,
      html: `<span class="timeline-icon warm">${icon("alert")}</span><div><div class="event-title"><strong>Repeated horn pattern · Review</strong><span class="pill warning">${r.adjustment < 0 ? "−1 point" : "Review only"}</span></div><p>${esc(zoneName(r.zoneId))} · ${esc(r.reason)}</p><small>${r.eventIds.length} distinct events; one deduction maximum per crossing.</small></div>`,
    })),
    ...crossings.map((c) => ({
      at: c.start,
      html: `<span class="timeline-icon ${c.outcome === "Point earned" ? "green" : ""}">${icon("leaf")}</span><div><div class="event-title"><strong>${esc(zoneName(c.zoneId))}</strong><span class="pill ${c.outcome === "Point earned" ? "success" : ""}">${c.outcome === "Point earned" ? "+1 point" : c.outcome}</span></div><p>${c.reasons.map(esc).join(" ")}</p><small>${time(c.start)} → ${c.end ? time(c.end) : "Trip ended before exit"}</small></div>`,
    })),
  ].sort((a, b) => a.at - b.at);
  return `<div class="report-heading"><div><p class="eyebrow">THE JOURNEY, REFLECTED</p><h1>Your trip report.</h1><p>${date(t.startedAt)} · ${clock((t.endedAt ?? t.startedAt) - t.startedAt)} · ${t.mode === "live" ? "Real trip" : t.mode === "demo-mic" ? "Demo GPS · real microphone" : "Simulated audio + GPS"}</p></div><div class="points-badge"><strong>${points}</strong><span>net points</span>${icon("leaf")}</div></div>${savePending ? `<div class="message error">This report is only in memory. Local saving failed. ${button("Retry save", "retry-save", "outline")}</div>` : `<div class="saved-label">${icon("check")} Saved on this device · ${esc(t.detector)}</div>`}<div class="stats-grid report-stats"><div class="stat"><span>Likely your horn</span><strong>${t.events.filter((e) => e.label === "Likely your horn").length}</strong></div><div class="stat"><span>Uncertain detections</span><strong>${t.events.filter((e) => e.label === "Uncertain").length}</strong></div><div class="stat"><span>Scored quiet crossings</span><strong>${scoreTrip(t).quietPoints}</strong></div><div class="stat"><span>Quiet-zone review items</span><strong>${t.events.filter((e) => e.review).length}</strong></div></div><p class="small muted">${scoreTrip(t).quietPoints} quiet crossing points − ${scoreTrip(t).deductions} repeat-honk deductions = ${points} net points. ${t.repeatPenalty ? "Repeat deductions enabled for this trip." : "Repeat deductions disabled for this trip."}</p><section class="card route-card"><div class="card-heading"><h2>A sketch of your route</h2><small>No external maps</small></div>${routeSvg(t)}<div class="route-legend"><span><i></i> Route</span><span><i class="orange"></i> Review event</span><span><i class="gold"></i> Other detection</span></div><p class="small">${t.events.filter((e) => !e.location).length} unlocated events retained. Gaps are not connected. This sketch is not a navigation map.</p></section><section class="card timeline-card"><div class="card-heading"><h2>Trip timeline</h2><span class="muted">${rows.length} items</span></div>${rows.length ? `<ol class="timeline">${rows.map((r) => `<li><time>${time(r.at)}</time>${r.html}</li>`).join("")}</ol>` : '<div class="empty">No detections or zone crossings recorded. Check coverage below; silence alone does not establish a quiet crossing.</div>'}</section><details class="details"><summary>Coverage & scoring notes · ${t.gaps.filter((g) => (g.end ?? t.endedAt!) - g.start > 0).length} interruptions</summary><p>One point per complete, silent quiet-zone crossing with continuous usable mic and GPS. Detections anywhere during a crossing, including uncertain or unlocated sounds, prevent a point. Boundary hysteresis limits GPS drift rewards.</p>${
    t.gaps
      .filter((g) => (g.end ?? t.endedAt!) - g.start > 0)
      .map(
        (g) =>
          `<p><strong>${g.kind === "mic" ? "Microphone" : "GPS"} · ${time(g.start)}–${time(g.end ?? t.endedAt!)}</strong><br>${esc(g.reason)}</p>`,
      )
      .join("") || "<p>No coverage interruptions recorded.</p>"
  }<p>Entirely missed zones cannot be inferred from missing GPS. “Review” and “Near marked corner” describe context, not whether a honk was justified. AI and spectral scores are similarity evidence, not ownership probabilities. Real-world accuracy is not yet measured. Individual events can fall back to Spectral matching when AI evidence is unavailable.</p></details><div class="report-actions">${button("Back to overview " + icon("arrow"), "home", "primary")}${button("Export report JSON", "export", "outline")}</div>`;
}
function historyView() {
  return `<div class="page-heading"><p class="eyebrow">SAVED ON THIS DEVICE</p><h1>Every trip, a little insight.</h1><p>Your local journey log. Clearing browser data removes these reports and your calibration.</p></div><section class="card">${history.length ? history.map((t) => `<button class="history-row" data-action="report-${t.id}"><span class="icon-tile">${icon(t.mode === "live" ? "pin" : "play")}</span><span><strong>${date(t.startedAt)}</strong><small>${t.mode === "live" ? "Real trip" : t.mode === "demo-mic" ? "Demo · real microphone" : "Demo · simulated audio"} · ${clock((t.endedAt ?? t.startedAt) - t.startedAt)}</small></span><span class="history-points">${scoreTrip(t).totalPoints} pts</span>${icon("chevron")}</button>`).join("") : `<div class="empty">${icon("history")}<h2>A fresh start.</h2><p>Your first report will appear here after you end a trip.</p>${button("Back to overview", "home", "outline")}</div>`}</section>`;
}
function fail(e: unknown) {
  error = e instanceof Error ? e.message : String(e);
  render();
}
function updateMeter() {
  const meter = document.querySelector<HTMLElement>("#mic-meter");
  if (meter) meter.style.width = `${Math.min(100, Math.sqrt(level) * 160)}%`;
  const count = document.querySelector("#capture-countdown");
  if (count && capture)
    count.textContent = `${Math.max(0, Math.ceil((capture.end - Date.now()) / 1000))} seconds remaining`;
}
ai.onStatus = () => {
  if (page === "calibrate" || page === "live") render();
};
mic.onPcm = (pcm, end) => ai.push(pcm, end);
mic.onPcmError = (reason) => ai.disable(reason);
function queueDetection(d: Detection) {
  const target = engine,
    reference = calibration;
  if (!target) return;
  if (target.trip.mode === "demo-scripted") {
    target.detection({
      ...d,
      simulated: true,
      detectorMode: "Spectral matching",
    });
    return;
  }
  if (!ai.ready || !reference?.ai) {
    target.detection(
      spectralFallback(
        d,
        aiEnabled()
          ? reference?.ai
            ? ai.reason
            : "Recalibrate to enable personal AI matching"
          : "AI disabled in settings",
      ),
    );
    return;
  }
  const task = (async () => {
    await new Promise((resolve) => setTimeout(resolve, 520));
    await ai.settle();
    const matched = ai.ready
      ? matchWithAi(d, reference, ai.history)
      : spectralFallback(d, ai.reason);
    target.detection(matched);
  })().finally(() => pendingEvents.delete(task));
  pendingEvents.add(task);
}
mic.onFrame = (frame) => {
  level = frame.rms;
  updateMeter();
  capture?.frames.push(frame);
  if (engine && detector && engine.trip.mode !== "demo-scripted")
    for (const d of detector.push(frame)) queueDetection(d);
};
mic.onStatus = (ok, reason, at) => {
  micMessage = reason;
  engine?.coverage("mic", ok && !document.hidden, at, reason);
  if (!ok) {
    if (capture) capture.interrupted = true;
    if (engine && detector) for (const d of detector.flush()) queueDetection(d);
  }
  if (page === "live" || page === "calibrate") render();
};
mic.onGap = (start, end) => {
  engine?.gap(
    "mic",
    start,
    end,
    "Audio processing paused for more than one second",
  );
  detector?.reset();
  ai.clear();
  mic.resetPcm();
  if (capture) capture.interrupted = true;
};

async function action(a: string) {
  if (a === "dismiss") {
    error = "";
    render();
    return;
  }
  if (busy) return;
  if (page === "live" && !["end", "resume-mic", "retry-gps"].includes(a))
    return;
  error = "";
  notice = "";
  try {
    if (a === "home" || a === "calibrate" || a === "history") {
      if (capture) {
        clearTimeout(captureTimer);
        capture = undefined;
      }
      mic.stop();
      ai.stop();
      micMessage = "Microphone off";
      page = a;
      if (a === "calibrate") {
        noise = undefined;
        noiseEmbedding = undefined;
        samples = [undefined, undefined, undefined];
      }
      if (a === "history") history = await storage.tripHistory();
      render();
    } else if (a === "enable-mic" || a === "resume-mic") {
      busy = true;
      render();
      try {
        await mic.start(aiEnabled());
        if (aiEnabled() && mic.pcmAvailable) await ai.start();
      } finally {
        busy = false;
        render();
      }
    } else if (a.startsWith("capture-")) startCapture(a.slice(8));
    else if (a === "save-calibration") {
      if (noise === undefined || !samples.every(Boolean)) return;
      const c: Calibration = {
        version: 1,
        createdAt: Date.now(),
        noiseRms: noise,
        fingerprints: samples.map((s) => s!.vector),
        sampleLevels: samples.map((s) => s!.level),
        mode: "Spectral matching",
      };
      if (aiEnabled() && noiseEmbedding && samples.every((s) => s?.ai))
        c.ai = {
          modelId: MODEL_ID,
          embeddings: samples.map((s) => s!.ai!.embedding),
          background: noiseEmbedding,
          hornScores: samples.map((s) => s!.ai!.hornScore),
        };
      await storage.saveCalibration(c);
      calibration = c;
      mic.stop();
      ai.stop();
      micMessage = "Microphone off";
      page = "home";
      notice = c.ai
        ? "Calibration saved. Your personal AI fingerprint is ready; no audio was stored."
        : "Calibration saved. Your phone is ready for a trip.";
      render();
    } else if (a === "start") await startTrip("live");
    else if (a === "demo")
      await startTrip(demoAudio === "scripted" ? "demo-scripted" : "demo-mic");
    else if (a === "retry-gps") startGps();
    else if (a === "end") await endTrip();
    else if (a === "latest") {
      report = latest;
      page = "report";
      render();
    } else if (a.startsWith("report-")) {
      report = history.find((t) => t.id === a.slice(7));
      page = "report";
      render();
    } else if (a === "retry-save" && savePending) {
      await persistTrip(savePending);
      render();
    } else if (a === "export" && report) {
      const url = URL.createObjectURL(
        new Blob(
          [
            JSON.stringify(
              { ...report, scoredCrossings: scoreCrossings(report) },
              null,
              2,
            ),
          ],
          { type: "application/json" },
        ),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `sonomend-${report.id}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  } catch (e) {
    busy = false;
    fail(e);
  }
}
function startCapture(kind: string) {
  if (capture || !mic.running) return;
  const target = kind === "noise" ? "noise" : Number(kind);
  if (target !== "noise" && (noise === undefined || target < 0 || target > 2))
    return;
  capture = {
    kind: target,
    frames: [],
    start: Date.now(),
    end: Date.now() + (target === "noise" ? 2000 : 3000),
    interrupted: false,
  };
  render();
  captureTimer = setTimeout(
    async () => {
      const result = capture;
      if (!result) return;
      await ai.settle();
      if (capture !== result) return;
      capture = undefined;
      try {
        if (result.interrupted || result.frames.length < 20)
          throw new Error(
            "Microphone coverage was interrupted. Keep this page visible and retry the sample.",
          );
        if (result.kind === "noise") {
          const levels = result.frames.map((f) => f.rms).sort((a, b) => a - b);
          const sampleNoise = levels[Math.floor(levels.length * 0.8)];
          if (sampleNoise > 0.1)
            throw new Error(
              "Background is too loud. Move somewhere quieter and retry.",
            );
          noise = sampleNoise;
          noiseEmbedding = ai.history.find(
            (f) => f.start >= result.start && f.end <= result.end,
          )?.embedding;
          samples = [undefined, undefined, undefined];
        } else {
          const spectral = fingerprint(result.frames, noise!);
          const modelFrame = ai.ready
            ? selectCalibrationFrame(
                ai.history,
                result.start,
                result.end,
                noise!,
                noiseEmbedding,
              )
            : undefined;
          samples[result.kind] = { ...spectral, ai: modelFrame };
          if (aiEnabled() && !modelFrame)
            notice =
              "Spectral sample captured. AI could not clearly recognize this horn; redo it for AI matching, or save all three samples for Spectral matching.";
        }
        render();
      } catch (e) {
        fail(e);
      }
    },
    target === "noise" ? 2000 : 3000,
  );
}
async function loadDemoZones(): Promise<Zone[]> {
  const response = await fetch(`${import.meta.env.BASE_URL}zones.json`);
  if (!response.ok)
    throw new Error(
      "Could not load local zones. Check that zones.json was deployed with the app.",
    );
  return validateZones(await response.json()) as Zone[];
}
async function startTrip(mode: TripMode) {
  if (engine || busy) return;
  if (mode !== "demo-scripted" && !calibration)
    throw new Error("Calibrate your horn before starting a microphone trip.");
  busy = true;
  render();
  try {
    const selectedZones = mode === "live" ? zones : await loadDemoZones();
    if (mode !== "demo-scripted") {
      await mic.start(aiEnabled() && personalized());
      if (aiEnabled() && personalized() && mic.pcmAvailable) await ai.start();
    }
    const at = Date.now();
    engine = new TripEngine(selectedZones, mode, at);
    engine.trip.repeatPenalty = settings.repeatPenalty !== false;
    ai.clear();
    if (mode !== "demo-scripted" && ai.ready && personalized())
      engine.trip.detector = "YAMNet + personal matching";
    const c: Calibration =
      mode === "demo-scripted"
        ? {
            version: 1,
            createdAt: at,
            noiseRms: 0.001,
            fingerprints: [
              [1, 0, 0, 0],
              [1, 0, 0, 0],
              [1, 0, 0, 0],
            ],
            sampleLevels: [0.15, 0.15, 0.15],
            mode: "Spectral matching",
          }
        : calibration!;
    detector = new SpectralDetector(c, settings.matchThreshold);
    engine.coverage("mic", mode === "demo-scripted" || !!mic.running, at);
    if (mode === "live") startGps();
    else engine.fix(demoFix(0, at));
    page = "live";
    busy = false;
    render();
    void requestWakeLock();
    let lastTick = at;
    tripTimer = setInterval(() => {
      if (!engine) return;
      const now = Date.now(),
        elapsed = now - at;
      if (now - lastTick > 2000) {
        engine.gap("gps", lastTick, now, "App processing was paused");
        engine.gap("mic", lastTick, now, "App processing was paused");
      }
      lastTick = now;
      if (mode !== "live") {
        if (settings.demoDropout && elapsed >= 13000 && elapsed < 19000) {
          engine.coverage("gps", false, now, "Simulated GPS dropout");
          gpsMessage = "Simulated GPS dropout (13–19 seconds)";
        } else {
          engine.fix(demoFix(elapsed, at));
          gpsMessage = "Demo GPS · ±5 m";
        }
      }
      engine.tick(now);
      render();
      if (mode !== "live" && elapsed >= 60000) void endTrip();
    }, 1000);
    if (mode === "demo-scripted")
      demoTimer = setInterval(() => {
        if (!engine || !detector || document.hidden) return;
        const now = Date.now();
        for (const d of detector.push(
          scriptedFrame(now, now - at, settings.demoRepeats === true),
        ))
          engine.detection({ ...d, simulated: true });
      }, 60);
  } catch (e) {
    mic.stop();
    ai.stop();
    busy = false;
    engine = undefined;
    detector = undefined;
    throw e;
  }
}
function startGps() {
  if (watchId !== undefined) navigator.geolocation?.clearWatch(watchId);
  if (!navigator.geolocation) {
    gpsMessage = "Geolocation is unavailable in this browser";
    engine?.coverage("gps", false, Date.now(), gpsMessage);
    render();
    return;
  }
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const now = Date.now();
      if (document.hidden) {
        engine?.coverage("gps", false, now, "Page is in the background");
        return;
      }
      if (now - pos.timestamp > 5000) {
        gpsMessage = "Position is more than 5 seconds old";
        engine?.coverage("gps", false, now, gpsMessage);
        return;
      }
      engine?.fix({
        at: pos.timestamp,
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      });
      gpsMessage =
        pos.coords.accuracy <= MAX_ACCURACY
          ? `GPS · ±${Math.round(pos.coords.accuracy)} m`
          : `Weak GPS · ±${Math.round(pos.coords.accuracy)} m (need ≤35 m)`;
    },
    (e) => {
      gpsMessage =
        e.code === 1
          ? "Location permission denied. Allow it in site settings and tap Retry GPS."
          : e.code === 2
            ? "Position unavailable. Move to an open area."
            : "GPS timed out. Waiting for a fresh position.";
      engine?.coverage("gps", false, Date.now(), gpsMessage);
      if (page === "live") render();
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 },
  );
}
async function endTrip() {
  if (!engine || busy) return;
  busy = true;
  clearInterval(tripTimer);
  clearInterval(demoTimer);
  const endedAt = Date.now();
  mic.stop();
  for (const d of detector?.flush() ?? []) queueDetection(d);
  if (watchId !== undefined) {
    navigator.geolocation?.clearWatch(watchId);
    watchId = undefined;
  }
  await Promise.all(pendingEvents);
  report = engine.end(endedAt);
  ai.stop();
  engine = undefined;
  detector = undefined;
  mic.stop();
  micMessage = "Microphone off";
  if (watchId !== undefined) {
    navigator.geolocation?.clearWatch(watchId);
    watchId = undefined;
  }
  void wakeLock?.release().catch(() => {});
  wakeLock = undefined;
  page = "report";
  savePending = report;
  try {
    await persistTrip(report);
  } catch {
    error =
      "The trip stopped, but browser storage could not save it. Export the report or retry saving.";
  } finally {
    busy = false;
    render();
  }
}
async function persistTrip(t: Trip) {
  await storage.saveTrip(t);
  latest = t;
  savePending = undefined;
  history = await storage.tripHistory();
}
async function requestWakeLock() {
  try {
    if ("wakeLock" in navigator && !document.hidden)
      wakeLock = await navigator.wakeLock.request("screen");
  } catch {
    /* Coverage tracking still handles screen/background interruptions. */
  }
}
document.addEventListener("visibilitychange", () => {
  const at = Date.now();
  if (document.hidden) {
    if (capture) capture.interrupted = true;
    if (engine) {
      for (const d of detector?.flush() ?? [])
        queueDetection({
          ...d,
          simulated: engine.trip.mode === "demo-scripted",
        });
      engine.coverage("mic", false, at, "Page hidden or phone locked");
      engine.coverage("gps", false, at, "Page hidden or phone locked");
    }
  } else if (engine) {
    mic.resetPcm();
    engine.coverage(
      "mic",
      engine.trip.mode === "demo-scripted" || !!mic.running,
      at,
      "Microphone needs resuming",
    );
    void requestWakeLock();
    render();
  }
});
window.addEventListener("beforeunload", (e) => {
  if (engine || savePending) {
    e.preventDefault();
    e.returnValue = "";
  }
});
async function init() {
  try {
    zones = await loadDemoZones();
    zoneReady = true;
  } catch (e) {
    error = String(e);
  }
  try {
    [calibration, latest] = await Promise.all([
      storage.loadCalibration(),
      storage.latestTrip(),
    ]);
    settings = (await storage.loadSettings()) ?? settings;
    history = await storage.tripHistory();
  } catch {
    error =
      "Local storage is unavailable. Allow browser storage to save calibration and trips; private mode may restrict it.";
  }
  render();
}
void init();
