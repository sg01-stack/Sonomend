import * as tf from "@tensorflow/tfjs-core";
import "@tensorflow/tfjs-backend-cpu";
import {
  loadTFLiteModel,
  setWasmPath,
  type TFLiteModel,
} from "@tensorflow/tfjs-tflite";

let model: TFLiteModel | undefined;
// A classic worker keeps synchronous WASM inference off the UI/audio threads.
const scope = self as unknown as {
  onmessage: (event: MessageEvent) => void;
  postMessage: (message: unknown) => void;
};
scope.onmessage = async ({ data }) => {
  try {
    if (data.type === "load") {
      await tf.setBackend("cpu");
      await tf.ready();
      setWasmPath(data.runtimeUrl);
      const response = await fetch(data.modelUrl);
      if (!response.ok) throw new Error("Bundled AI model could not be loaded");
      const bytes = await response.arrayBuffer();
      const hash = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
        (n) => n.toString(16).padStart(2, "0"),
      ).join("");
      if (hash !== data.sha256)
        throw new Error("AI model integrity check failed");
      model = await loadTFLiteModel(bytes, { numThreads: 1 });
      infer(new Float32Array(15600));
      scope.postMessage({ id: data.id, ready: true });
    } else if (data.type === "infer") {
      const started = performance.now();
      const output = infer(data.pcm);
      scope.postMessage({
        id: data.id,
        ...output,
        inferenceMs: performance.now() - started,
      });
    }
  } catch (error) {
    scope.postMessage({
      id: data.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
function infer(pcm: Float32Array) {
  if (!model || pcm.length !== 15600)
    throw new Error("AI needs one 975 ms audio window");
  const input = tf.tensor1d(pcm);
  let outputs: tf.Tensor[] = [];
  try {
    const result = model.predict(input);
    outputs =
      result instanceof tf.Tensor
        ? [result]
        : Array.isArray(result)
          ? result
          : Object.values(result);
    const scores = outputs.find((t) => t.size === 521);
    const embedding = outputs.find((t) => t.size === 1024);
    if (!scores || !embedding) throw new Error("Unexpected AI model output");
    return {
      scores: Array.from(scores.dataSync()),
      embedding: Array.from(embedding.dataSync()),
    };
  } finally {
    input.dispose();
    outputs.forEach((t) => t.dispose());
    pcm.fill(0);
  }
}
