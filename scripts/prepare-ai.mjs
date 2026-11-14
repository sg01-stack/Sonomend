import { resolve } from "node:path";
import { build } from "esbuild";
import { mkdir, copyFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const manifest = JSON.parse(await readFile("src/ai/model.json", "utf8"));
const bytes = await readFile("public/models/yamnet.tflite");
if (createHash("sha256").update(bytes).digest("hex") !== manifest.sha256)
  throw new Error("Bundled YAMNet checksum mismatch");
await copyFile("src/ai/model.json", "public/models/yamnet.json");
await mkdir("public/ai-runtime", { recursive: true });
for (const suffix of ["", "_simd"])
  for (const ext of ["js", "wasm"]) {
    const filename = `tflite_web_api_cc${suffix}.${ext}`;
    await copyFile(
      `node_modules/@tensorflow/tfjs-tflite/wasm/${filename}`,
      `public/ai-runtime/${filename}`,
    );
  }
await build({
  entryPoints: ["src/ai/worker.ts"],
  outfile: "public/ai-runtime/worker.js",
  bundle: true,
  alias: {
    "@tensorflow/tfjs-tflite": resolve(
      "node_modules/@tensorflow/tfjs-tflite/dist/tf-tflite.fesm.js",
    ),
  },
  format: "iife",
  platform: "browser",
  target: "es2020",
  minify: true,
  legalComments: "linked",
});
console.log("Prepared local AI worker, WASM runtime and verified model.");
