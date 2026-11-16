import { test, expect } from "vitest";
import { encodeWav, toBase64 } from "../src/hosted/wav";
test("WAV preserves duration and saturates finite PCM safely", () => {
  const samples = new Float32Array(48000);
  samples.set([-2, -1, 0, 1, 2, NaN]);
  const bytes = encodeWav(samples),
    view = new DataView(bytes.buffer);
  expect(bytes.length).toBe(96044);
  expect(view.getUint32(24, true)).toBe(16000);
  expect(
    Array.from({ length: 6 }, (_, i) => view.getInt16(44 + i * 2, true)),
  ).toEqual([-32768, -32768, 0, 32767, 32767, 0]);
  expect(atob(toBase64(bytes)).length).toBe(bytes.length);
  expect(() => encodeWav(new Float32Array(10))).toThrow();
});
