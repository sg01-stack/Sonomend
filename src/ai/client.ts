import manifest from "./model.json";
import type { AiFrame } from "./matching";

export class HornAi {
  ready = false;
  reason = "AI loads when you enable the microphone";
  history: AiFrame[] = [];
  onStatus = () => {};
  private worker?: Worker;
  private id = 0;
  private generation = 0;
  private pending?: Promise<void>;
  private requests = new Map<
    number,
    {
      resolve: (value: any) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private slow = 0;
  async start() {
    if (this.ready) return;
    this.stop();
    this.reason = "Loading free on-device AI…";
    this.onStatus();
    const generation = this.generation;
    try {
      const base = new URL(import.meta.env.BASE_URL, location.href);
      this.worker = new Worker(new URL("ai-runtime/worker.js", base));
      this.worker.onmessage = ({ data }) => {
        const request = this.requests.get(data.id);
        if (!request) return;
        clearTimeout(request.timer);
        this.requests.delete(data.id);
        data.error
          ? request.reject(new Error(data.error))
          : request.resolve(data);
      };
      this.worker.onerror = () => this.disable("AI runtime unavailable");
      await this.request(
        {
          type: "load",
          modelUrl: new URL("models/yamnet.tflite", base).href,
          runtimeUrl: new URL("ai-runtime/", base).href,
          sha256: manifest.sha256,
        },
        20000,
      );
      if (generation !== this.generation) return;
      this.ready = true;
      this.reason = "AI ready · runs privately on this device";
      this.onStatus();
    } catch (error) {
      if (generation === this.generation)
        this.disable(error instanceof Error ? error.message : "AI unavailable");
    }
  }
  push(pcm: Float32Array, end: number) {
    if (!this.ready || this.pending) {
      pcm.fill(0);
      return;
    }
    const generation = this.generation;
    const rms = Math.sqrt(pcm.reduce((s, v) => s + v * v, 0) / pcm.length);
    const pending = this.request({ type: "infer", pcm }, 2000, [
      pcm.buffer as ArrayBuffer,
    ])
      .then((data) => {
        if (generation !== this.generation) return;
        if (data.inferenceMs > 400) this.slow++;
        else this.slow = 0;
        if (this.slow >= 3) {
          this.disable("AI is too slow on this device");
          return;
        }
        const frame: AiFrame = {
          start: end - 975,
          end,
          embedding: data.embedding,
          hornScore: Math.max(data.scores[302], data.scores[312]),
          inferenceMs: data.inferenceMs,
          rms,
        };
        this.history.push(frame);
        this.history = this.history.filter((f) => f.end > end - 10000);
      })
      .catch((error) => {
        if (generation === this.generation) this.disable(error.message);
      })
      .finally(() => {
        if (this.pending === pending) this.pending = undefined;
      });
    this.pending = pending;
  }
  async settle() {
    await this.pending;
  }
  clear() {
    this.history = [];
  }
  disable(reason: string) {
    this.stop();
    this.reason = `${reason}. Using Spectral matching.`;
    this.onStatus();
  }
  stop() {
    this.reason = "AI loads when you enable the microphone";
    this.generation++;
    this.ready = false;
    this.worker?.terminate();
    this.worker = undefined;
    for (const request of this.requests.values()) {
      clearTimeout(request.timer);
      request.reject(new Error("AI stopped"));
    }
    this.requests.clear();
    this.pending = undefined;
    this.history = [];
    this.slow = 0;
  }
  private request(
    data: object,
    timeout: number,
    transfer: Transferable[] = [],
  ) {
    const id = ++this.id;
    return new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.requests.delete(id);
        reject(new Error("AI processing timed out"));
      }, timeout);
      this.requests.set(id, { resolve, reject, timer });
      try {
        this.worker!.postMessage({ ...data, id }, transfer);
      } catch (e) {
        clearTimeout(timer);
        this.requests.delete(id);
        reject(e);
      }
    });
  }
}
