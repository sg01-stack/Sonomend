# Third-party notices

- **YAMNet**: Copyright the TensorFlow Authors / Google. Apache License 2.0. The locally bundled quantized classifier is obtained through a pinned mirror and modified only to expose existing pooled embeddings. Source, exact checksums, graph changes, and license: `public/models/README.md`, `public/models/LICENSE-YAMNET`.
- **AudioSet class names and IDs**: Google Inc., AudioSet ontology, Creative Commons Attribution-ShareAlike 4.0. `public/models/classes.csv` preserves the original class mapping. Attribution/source: https://github.com/audioset/ontology. Full terms: `public/models/LICENSE-AUDIOSET`.
- **TensorFlow.js Core, CPU backend, and TensorFlow.js TFLite/WASM**: Google LLC / TensorFlow Authors, Apache License 2.0. Dependency versions/integrities are locked in `package-lock.json`. The build preserves linked bundled-code license notices in `ai-runtime/worker.js.LEGAL.txt`, and includes the Apache license with the model. Source: https://github.com/tensorflow/tfjs.

No remote inference provider, paid API, or hosted model account is used. Original third-party authors do not endorse Sonomend or its similarity/scoring thresholds.
