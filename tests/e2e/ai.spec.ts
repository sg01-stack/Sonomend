import { test, expect } from "@playwright/test";

test("bundled model runs real inference, rejects tampering, and makes no external requests", async ({
  page,
  baseURL,
}) => {
  const foreign: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).origin !== new URL(baseURL!).origin)
      foreign.push(r.url());
  });
  await page.goto("/?tools");
  const result = await page.evaluate(async () => {
    const manifest = await (await fetch("./models/yamnet.json")).json();
    const w = new Worker("./ai-runtime/worker.js");
    let id = 0;
    const call = (data: object) =>
      new Promise<any>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(Error("AI test timed out")),
          20000,
        );
        w.onmessage = (e) => {
          clearTimeout(timer);
          e.data.error ? reject(Error(e.data.error)) : resolve(e.data);
        };
        w.onerror = (e) => {
          clearTimeout(timer);
          reject(Error(e.message));
        };
        w.postMessage({ id: ++id, ...data });
      });
    let rejected = false;
    try {
      await call({
        type: "load",
        modelUrl: location.origin + "/models/yamnet.tflite",
        runtimeUrl: location.origin + "/ai-runtime/",
        sha256: "invalid",
      });
    } catch {
      rejected = true;
    }
    await call({
      type: "load",
      modelUrl: location.origin + "/models/yamnet.tflite",
      runtimeUrl: location.origin + "/ai-runtime/",
      sha256: manifest.sha256,
    });
    const silence = await call({ type: "infer", pcm: new Float32Array(15600) });
    const pcm = Float32Array.from({ length: 15600 }, (_, i) => {
      const t = i / 16000,
        envelope =
          t > 0.18 && t < 0.68
            ? Math.min(1, (t - 0.18) / 0.03, (0.68 - t) / 0.03)
            : 0;
      let value = 0;
      for (const f of [420, 510])
        for (let h = 1; h <= 8; h++)
          value += Math.sin(2 * Math.PI * f * h * t) / h;
      return value * 0.2 * envelope;
    });
    const horn = await call({ type: "infer", pcm });
    w.terminate();
    return {
      rejected,
      silenceTop: silence.scores.indexOf(Math.max(...silence.scores)),
      hornScore: horn.scores[302],
      embeddingLength: horn.embedding.length,
      finite: horn.embedding.every(Number.isFinite),
      inferenceMs: horn.inferenceMs,
    };
  });
  expect(result.rejected).toBe(true);
  expect(result.silenceTop).toBe(494);
  expect(result.hornScore).toBeGreaterThan(0.2);
  expect(result.embeddingLength).toBe(1024);
  expect(result.finite).toBe(true);
  expect(foreign).toEqual([]);
  test.info().annotations.push({
    type: "synthetic-signal inference time",
    description: `${result.inferenceMs.toFixed(1)} ms on cloud Chromium; not an Android benchmark`,
  });
});

test("personal AI calibration, live capture and scored evidence survive reload", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.addInitScript(() => {
    const w = window as any;
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: async () => {
        const context = new AudioContext({ sampleRate: 16000 });
        await context.resume();
        const dest = context.createMediaStreamDestination();
        const zero = context.createConstantSource();
        zero.offset.value = 0;
        zero.connect(dest);
        zero.start();
        w.testStream = dest.stream;
        w.playSyntheticHorn = () => {
          const buffer = context.createBuffer(1, 15600, 16000),
            pcm = buffer.getChannelData(0);
          for (let i = 0; i < pcm.length; i++) {
            const t = i / 16000,
              envelope =
                t > 0.18 && t < 0.68
                  ? Math.min(1, (t - 0.18) / 0.03, (0.68 - t) / 0.03)
                  : 0;
            let value = 0;
            for (const f of [420, 510])
              for (let h = 1; h <= 8; h++)
                value += Math.sin(2 * Math.PI * f * h * t) / h;
            pcm[i] = value * 0.2 * envelope;
          }
          const source = context.createBufferSource();
          source.buffer = buffer;
          source.connect(dest);
          source.start();
        };
        return dest.stream;
      },
    });
  });
  await page.goto("/?tools");
  await page.getByRole("button", { name: "Calibration", exact: true }).click();
  await page.getByRole("button", { name: "Enable microphone / retry" }).click();
  await expect(
    page.getByText("AI ready · runs privately on this device", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sample background · 2 sec" }).click();
  await expect(
    page.getByRole("button", { name: "Record honk 1 · 3 sec" }),
  ).toBeVisible();
  for (let i = 1; i <= 3; i++) {
    await page
      .getByRole("button", { name: `Record honk ${i} · 3 sec` })
      .click();
    await page.waitForTimeout(400);
    await page.evaluate(() => (window as any).playSyntheticHorn());
    await expect(
      page.getByRole("button", {
        name: i === 3 ? "Save calibration" : `Record honk ${i + 1} · 3 sec`,
      }),
    ).toBeVisible();
  }
  await expect(
    page.getByText("Personal AI + spectral fingerprint captured.", {
      exact: true,
    }),
  ).toHaveCount(3);
  await page.getByRole("button", { name: "Save calibration" }).click();
  await expect(
    page.getByText("Your personal AI fingerprint is saved on this device."),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Your personal AI fingerprint is saved on this device."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start demo trip" }).click();
  await expect(page.locator(".live-header")).toContainText(
    "YAMNet + personal matching",
  );
  await page.waitForTimeout(1200);
  await page.evaluate(() => (window as any).playSyntheticHorn());
  await page.waitForTimeout(2200);
  await page.getByRole("button", { name: "End trip & see report" }).click();
  await expect(page.locator(".timeline")).toContainText("Likely your horn");
  await expect(page.locator(".timeline")).toContainText(
    "personal embedding match",
  );
  expect(
    await page.evaluate(() =>
      (window as any).testStream
        .getTracks()
        .every((t: MediaStreamTrack) => t.readyState === "ended"),
    ),
  ).toBe(true);
  await page.reload();
  await page.getByRole("button", { name: "View report" }).click();
  await expect(page.locator(".timeline")).toContainText(
    "YAMNet + personal matching",
  );
  await page.screenshot({
    path: "test-results/ai-report-mobile.png",
    fullPage: true,
  });
});

test("a failed model load keeps spectral calibration usable and clearly labeled", async ({
  page,
}) => {
  await page.route("**/models/yamnet.tflite", (route) => route.abort());
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: async () => {
        const c = new AudioContext();
        await c.resume();
        const d = c.createMediaStreamDestination(),
          s = c.createConstantSource();
        s.offset.value = 0;
        s.connect(d);
        s.start();
        return d.stream;
      },
    });
  });
  await page.goto("/?tools");
  await page.getByRole("button", { name: "Calibration", exact: true }).click();
  await page.getByRole("button", { name: "Enable microphone / retry" }).click();
  await expect(page.getByText(/Using Spectral matching\./)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sample background · 2 sec" }),
  ).toBeEnabled();
});

test("new repeat rule persists and scripted demo cannot earn daily rewards", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/?tools");
  await page.selectOption("#demo-audio", "scripted");
  await page
    .getByLabel("Simulate three separate honks (scripted audio)")
    .check();
  await page.getByRole("button", { name: "Start demo trip" }).click();
  await page.clock.runFor(61000);
  await expect(page.locator(".points-badge strong")).toHaveText("1");
  await expect(page.locator(".timeline")).toContainText("Repeated horn burst");
  await expect(page.locator(".timeline")).toContainText("within 5 seconds");
  await page.reload();
  await expect(page.locator('[data-counter="propers"]')).toHaveText("0");
  await expect(page.locator('[data-counter="rewards"]')).toHaveText("0");
  await page.getByRole("button", { name: "View report" }).click();
  await expect(page.locator(".points-badge strong")).toHaveText("1");
});
