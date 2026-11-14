# Bundled YAMNet

`yamnet.tflite` is a quantized YAMNet road-sound classifier with its existing pooled embedding exposed as a second, dequantized output. No learned weights or classifier calculations were changed. Input: 15,600 mono float32 samples at 16 kHz. Outputs: 521 class scores and 1,024 embedding values. Runtime assets are local; no model service is contacted.

## Provenance and integrity

The primary Google/TF Hub hosts were inaccessible in the build environment. The source TFLite artifact and original class map were obtained from the public npm package `@apocaliss92/scrypted-yamnet@0.0.3`, specifically `package/src/model/yamnet.tflite`. No plugin code from that package is used.

- Source tarball: `https://registry.npmjs.org/@apocaliss92/scrypted-yamnet/-/scrypted-yamnet-0.0.3.tgz`
- npm tarball integrity: `sha512-ufpHeqskJvLYYlcGrbJ58GUnschxBk+MQHj6mDEvkfJAIYKUV6faKRYSNAFn6M805kL4ak7gpCdD2kdfumcqLA==`
- Original model SHA-256: `10c95ea3eb9a7bb4cb8bddf6feb023250381008177ac162ce169694d05c317de`
- Sonomend model SHA-256: `6fad4f72a244604594049148e1d0b1c9f9eddf2a75db721f60be0929e40d3cca`
- Sonomend model size: 4,120,680 bytes.
- Model identity: `yamnet-int8-sonomend-v1`.

The TFLite copy comes through a third-party mirror; byte-for-byte comparison against a download from Google's blocked host was not performed. Integrity is pinned to the source above. The exposed embedding comes from tensor 115 (`tower0/network/layer28/reduce_mean`), an INT8 tensor shaped `[1,1,1,1024]` feeding the original classifier. The added DEQUANTIZE operation exposes those features as float32; original scores remain output 120. The browser tests verify actual inference on silence and synthetic horn-like pulses, plus the full personal-calibration flow. They do not establish real-world accuracy.

## Reproduce the graph change (development only)

Use Python with `numpy` and `flatbuffers`. Obtain `schema_py_generated.py` from the official `tensorflow-cpu==2.19.0` PyPI wheel (`tensorflow/lite/python/schema_py_generated.py`); the full TensorFlow runtime need not be installed. Download the pinned npm tarball, verify its SHA-512 integrity above, and extract the source model. Then:

```sh
python scripts/expose-yamnet-embeddings.py /path/to/original/yamnet.tflite /directory/containing/schema_py_generated.py
npm run prepare:ai
```

The script verifies the original model's SHA-256, asserts the expected embedding shape/type and existing dequantization operator, preserves all learned weights and existing operators, and writes the new model plus `src/ai/model.json`. `prepare:ai` verifies the final model checksum and copies the manifest to this directory for deployment. It bundles the worker and copies single-threaded plain/SIMD WASM from locked npm dependencies. Normal app installation/build uses the committed model and does not need Python or these upstream downloads.

## Licenses

YAMNet is by the TensorFlow Authors / Google, released under Apache-2.0. See `LICENSE-YAMNET` and the original [TensorFlow Model Garden](https://github.com/tensorflow/models/tree/master/research/audioset/yamnet) and [model card](https://github.com/tensorflow/tfhub.dev/blob/master/assets/docs/google/models/yamnet/1.md). The existing quantized classifier is a YAMNet conversion; Sonomend's graph change is described above.

`classes.csv` retains the original AudioSet/YAMNet class order. Class identifiers/names derive from Google's AudioSet ontology, licensed CC BY-SA 4.0; attribution is retained here and the license text is in `LICENSE-AUDIOSET`. Sonomend uses indices 302 (vehicle/car horn) and 312 (air/truck horn), not musical or train horns. See [AudioSet ontology](https://github.com/audioset/ontology).
