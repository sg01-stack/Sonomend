import type { Frame } from "./types";

export class Microphone {
  private context?: AudioContext;
  private stream?: MediaStream;
  private source?: MediaStreamAudioSourceNode;
  private timer?: ReturnType<typeof setInterval>;
  private generation = 0;
  private lastAt = 0;
  private worklet?: AudioWorkletNode;
  private silentOutput?: GainNode;
  get pcmAvailable() {
    return !!this.worklet;
  }
  onPcm: (pcm: Float32Array, end: number) => void = () => {};
  onPcmError: (reason: string) => void = () => {};
  onFrame: (frame: Frame) => void = () => {};
  onStatus: (ok: boolean, reason: string, at: number) => void = () => {};
  onGap: (start: number, end: number) => void = () => {};
  get running() {
    return (
      this.context?.state === "running" &&
      this.stream
        ?.getAudioTracks()
        .some((t) => t.readyState === "live" && !t.muted)
    );
  }
  async start(withPcm = false) {
    this.stop();
    const generation = ++this.generation;
    if (!window.isSecureContext)
      throw new Error(
        "Microphone access requires HTTPS (or localhost for development). Open this app on a secure connection and retry.",
      );
    if (!navigator.mediaDevices?.getUserMedia)
      throw new Error(
        "This browser does not provide microphone access. Try Android Chrome over HTTPS.",
      );
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
        video: false,
      });
    } catch (e) {
      throw new Error(microphoneError(e));
    }
    if (generation !== this.generation) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    this.stream = stream;
    try {
      this.context = new AudioContext({ sampleRate: 16000 });
      await this.context.resume();
      const analyser = this.context.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0;
      this.source = this.context.createMediaStreamSource(stream);
      this.source.connect(analyser);
      if (withPcm) {
        try {
          if (this.context.sampleRate !== 16000)
            throw new Error("16 kHz audio is unavailable");
          await this.context.audioWorklet.addModule(
            `${import.meta.env.BASE_URL}pcm-worklet.js`,
          );
          if (generation !== this.generation || !this.context) return;
          this.worklet = new AudioWorkletNode(this.context, "sonomend-pcm");
          this.silentOutput = this.context.createGain();
          this.silentOutput.gain.value = 0;
          this.source
            .connect(this.worklet)
            .connect(this.silentOutput)
            .connect(this.context.destination);
          this.worklet.port.onmessage = ({ data }) => {
            if (!this.context || document.hidden || !this.running) {
              data.pcm.fill(0);
              return;
            }
            const lag =
              Math.max(0, this.context.currentTime - data.audioTime) * 1000;
            if (lag > 1000) {
              data.pcm.fill(0);
              this.resetPcm();
              return;
            }
            this.onPcm(data.pcm, Date.now() - lag);
          };
          this.worklet.onprocessorerror = () =>
            this.onPcmError("AI audio capture stopped");
        } catch {
          this.onPcmError("AI audio capture unavailable in this browser");
        }
      }
      const time = new Float32Array(analyser.fftSize),
        freq = new Float32Array(analyser.frequencyBinCount);
      const sampleRate = this.context.sampleRate;
      this.context.onstatechange = () =>
        this.onStatus(
          !!this.running,
          this.running
            ? "Microphone active"
            : "Audio capture suspended; tap Resume microphone",
          Date.now(),
        );
      for (const track of stream.getAudioTracks()) {
        track.onended = () =>
          this.onStatus(
            false,
            "Microphone disconnected; tap Resume microphone",
            Date.now(),
          );
        track.onmute = () =>
          this.onStatus(false, "Microphone muted or interrupted", Date.now());
        track.onunmute = () =>
          this.onStatus(!!this.running, "Microphone active", Date.now());
      }
      this.lastAt = 0;
      this.timer = setInterval(() => {
        const at = Date.now();
        if (this.lastAt && at - this.lastAt > 1000) this.onGap(this.lastAt, at);
        this.lastAt = at;
        if (!this.running || document.hidden) return;
        analyser.getFloatTimeDomainData(time);
        analyser.getFloatFrequencyData(freq);
        const rms = Math.sqrt(
          time.reduce((s, v) => s + v * v, 0) / time.length,
        );
        // Fixed Hz bands make fingerprints independent of the device sample rate.
        const spectrum = Array.from({ length: 48 }, (_, band) => {
          const low = 120 * (6000 / 120) ** (band / 48),
            high = 120 * (6000 / 120) ** ((band + 1) / 48);
          let energy = 0;
          for (
            let i = Math.ceil((low * analyser.fftSize) / sampleRate);
            i <= Math.floor((high * analyser.fftSize) / sampleRate) &&
            i < freq.length;
            i++
          )
            energy += 10 ** (freq[i] / 10);
          return Math.sqrt(energy);
        });
        this.onFrame({ at, rms, spectrum });
        // No recording or waveform is retained. Buffers are overwritten next frame.
      }, 60);
      this.onStatus(!!this.running, "Microphone active", Date.now());
    } catch (e) {
      this.stop();
      throw e;
    }
  }
  stop() {
    this.generation++;
    if (this.worklet) {
      this.worklet.port.onmessage = null;
      this.worklet.port.postMessage("reset");
      this.worklet.disconnect();
      this.worklet = undefined;
    }
    this.silentOutput?.disconnect();
    this.silentOutput = undefined;
    clearInterval(this.timer);
    this.timer = undefined;
    if (this.context) {
      this.context.onstatechange = null;
      void this.context.close().catch(() => {});
    }
    this.context = undefined;
    this.source?.disconnect();
    this.source = undefined;
    this.stream?.getTracks().forEach((t) => {
      t.onended = null;
      t.onmute = null;
      t.onunmute = null;
      t.stop();
    });
    this.stream = undefined;
  }
  resetPcm() {
    this.worklet?.port.postMessage("reset");
  }
}
function microphoneError(error: unknown) {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError")
    return "Microphone permission was denied. Allow microphone access in your browser’s site settings, then retry.";
  if (name === "NotFoundError")
    return "No microphone found. Connect a microphone, then retry.";
  if (name === "NotReadableError")
    return "The microphone is busy or unavailable. Close other recording apps, then retry.";
  return `Could not open the microphone. Check your device and retry. ${error instanceof Error ? error.message : ""}`;
}
