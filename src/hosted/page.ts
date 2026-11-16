import { encodeWav, toBase64 } from "./wav";

export function mountSoundCheck(host: HTMLElement): () => void {
  host.innerHTML = `<section class="card"><p class="eyebrow">OPTIONAL · SAFELY PARKED</p><h1>Sound check</h1>
    <p>A separate three-second clip for a general horn second opinion. This cannot identify your vehicle or change trip scores.</p>
    <p>Playback stays local. Only Send uploads this clip through this site's server to Google Gemini. Google's unpaid services may use audio and responses to improve products and involve human review. Avoid speech and private information.</p>
    <p><a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noopener noreferrer">Google data terms</a></p>
    <p id="hosted-status" role="status">Checking availability…</p>
    <button class="button outline" id="hosted-record" disabled>Record 3 seconds</button>
    <audio id="hosted-playback" controls hidden></audio>
    <label class="checkbox"><input id="hosted-consent" type="checkbox"> I consent to uploading this clip to Google Gemini under these terms.</label>
    <button class="button primary" id="hosted-send" disabled>Send for sound check</button>
    <button class="button outline" id="hosted-clear">Clear / cancel</button>
    <p id="hosted-result" role="status" aria-live="polite"></p>
    <small>Clips are held only in memory and cleared when you leave, hide this page, or choose Clear. Canceling cannot recall audio already sent. Free-tier availability depends on the configured provider project.</small></section>`;
  const record = host.querySelector<HTMLButtonElement>("#hosted-record")!;
  const send = host.querySelector<HTMLButtonElement>("#hosted-send")!;
  const consent = host.querySelector<HTMLInputElement>("#hosted-consent")!;
  const playback = host.querySelector<HTMLAudioElement>("#hosted-playback")!;
  const status = host.querySelector<HTMLElement>("#hosted-status")!;
  const result = host.querySelector<HTMLElement>("#hosted-result")!;
  let alive = true,
    enabled = false,
    busy = false,
    generation = 0;
  let clip: Uint8Array<ArrayBuffer> | undefined,
    url = "";
  let stream: MediaStream | undefined,
    context: AudioContext | undefined,
    node: AudioWorkletNode | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined,
    request: AbortController | undefined;
  const statusRequest = new AbortController();
  const update = () => {
    record.disabled = !enabled || busy;
    send.disabled = !enabled || busy || !clip || !consent.checked;
    consent.disabled = busy;
  };
  const stop = () => {
    clearTimeout(timer);
    node?.disconnect();
    if (node) node.port.onmessage = null;
    node = undefined;
    stream?.getTracks().forEach((t) => t.stop());
    stream = undefined;
    if (context) {
      context.onstatechange = null;
      void context.close().catch(() => {});
      context = undefined;
    }
  };
  const clear = () => {
    generation++;
    request?.abort();
    request = undefined;
    stop();
    busy = false;
    clip?.fill(0);
    clip = undefined;
    playback.pause();
    playback.removeAttribute("src");
    playback.load();
    playback.hidden = true;
    if (url) URL.revokeObjectURL(url);
    url = "";
    consent.checked = false;
    result.textContent = "";
    update();
  };
  consent.onchange = update;
  host.querySelector<HTMLButtonElement>("#hosted-clear")!.onclick = clear;
  record.onclick = async () => {
    clear();
    const turn = generation;
    busy = true;
    update();
    result.textContent = "Waiting for microphone permission…";
    try {
      const acquired = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      if (!alive || turn !== generation) {
        acquired.getTracks().forEach((t) => t.stop());
        return;
      }
      stream = acquired;
      const ctx = new AudioContext({ sampleRate: 16000 });
      context = ctx;
      if (ctx.sampleRate !== 16000)
        throw Error(
          "This device cannot record at 16 kHz. On-device matching remains available.",
        );
      await ctx.audioWorklet.addModule(
        `${import.meta.env.BASE_URL}sound-check-worklet.js`,
      );
      if (!alive || turn !== generation) return;
      node = new AudioWorkletNode(ctx, "sound-check");
      node.port.onmessage = (event: MessageEvent<Float32Array>) => {
        if (!alive || turn !== generation) return;
        try {
          clip = encodeWav(event.data);
          event.data.fill(0);
          stop();
          busy = false;
          url = URL.createObjectURL(new Blob([clip], { type: "audio/wav" }));
          playback.src = url;
          playback.hidden = false;
          result.textContent =
            "Clip ready. Listen before deciding whether to send.";
          update();
        } catch (error) {
          clear();
          result.textContent = String(error);
        }
      };
      const interrupted = () => {
        if (alive && turn === generation && busy) {
          clear();
          result.textContent =
            "Recording interrupted. Please try again while this page stays visible.";
        }
      };
      acquired.getTracks().forEach((t) => {
        t.onended = interrupted;
        t.onmute = interrupted;
      });
      ctx.createMediaStreamSource(acquired).connect(node);
      const mute = ctx.createGain();
      mute.gain.value = 0;
      node.connect(mute).connect(ctx.destination);
      await ctx.resume();
      if (!alive || turn !== generation) return;
      ctx.onstatechange = () => {
        if (ctx.state !== "running") interrupted();
      };
      result.textContent = "Recording for 3 seconds… Stay safely parked.";
      timer = setTimeout(interrupted, 6000);
    } catch (error) {
      if (alive && turn === generation) {
        clear();
        result.textContent =
          error instanceof Error ? error.message : "Microphone unavailable.";
      }
    }
  };
  send.onclick = async () => {
    if (!clip || !consent.checked || busy || !enabled) return;
    const turn = generation;
    busy = true;
    playback.pause();
    update();
    result.textContent = "Sending this clip…";
    request = new AbortController();
    try {
      const response = await fetch("/api/hosted/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent: true, audio: toBase64(clip) }),
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(25000)]),
      });
      const data = await response.json();
      if (!response.ok)
        throw Error(
          typeof data.error === "string"
            ? data.error
            : "Sound check unavailable.",
        );
      if (
        !["horn", "other", "uncertain"].includes(data.sound) ||
        !Number.isInteger(data.hornCount) ||
        data.hornCount < 0 ||
        data.hornCount > 12 ||
        typeof data.explanation !== "string" ||
        data.explanation.length > 300
      )
        throw Error("Invalid sound-check response.");
      if (alive && turn === generation)
        result.textContent = `${data.sound} · ${data.hornCount} estimated horn bursts. ${data.explanation} Trip scores unchanged.`;
    } catch (error) {
      if (alive && turn === generation)
        result.textContent =
          error instanceof Error ? error.message : "Sound check unavailable.";
    } finally {
      if (alive && turn === generation) {
        busy = false;
        consent.checked = false;
        update();
      }
    }
  };
  void fetch("/api/hosted/status", {
    signal: AbortSignal.any([statusRequest.signal, AbortSignal.timeout(5000)]),
    cache: "no-store",
  })
    .then(async (response) => {
      if (!response.ok) throw Error();
      const data = await response.json();
      if (!alive) return;
      enabled = data.enabled === true;
      status.textContent = enabled
        ? "Google Gemini sound check available. Recording does not upload."
        : "Hosted sound check is not configured. On-device AI remains available.";
      update();
    })
    .catch(() => {
      if (alive) {
        status.textContent =
          "Hosted sound check is unavailable on this host. On-device AI remains available.";
        update();
      }
    });
  const hidden = () => {
    if (document.hidden) clear();
  };
  document.addEventListener("visibilitychange", hidden);
  window.addEventListener("pagehide", clear);
  return () => {
    alive = false;
    statusRequest.abort();
    clear();
    document.removeEventListener("visibilitychange", hidden);
    window.removeEventListener("pagehide", clear);
  };
}
