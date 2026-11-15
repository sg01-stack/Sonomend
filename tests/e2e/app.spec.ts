import { test, expect, Page } from "@playwright/test";

// A synthetic audio source replaces only getUserMedia; the app's real AudioContext,
// analyser, calibration UI, fingerprint extractor, detector, and trip logic all run.
async function audioHarness(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as {
      testAudio: {
        gain: GainNode;
        osc: OscillatorNode;
        context: AudioContext;
        stream: MediaStream;
      };
      testMicDenied: boolean;
    };
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: async () => {
        if (w.testMicDenied)
          throw new DOMException("Denied", "NotAllowedError");
        const context = new AudioContext();
        await context.resume();
        const osc = context.createOscillator(),
          gain = context.createGain(),
          dest = context.createMediaStreamDestination();
        osc.frequency.value = 440;
        gain.gain.value = 0.0001;
        osc.connect(gain);
        gain.connect(dest);
        osc.start();
        w.testAudio = { gain, osc, context, stream: dest.stream };
        return dest.stream;
      },
    });
  });
}
async function tone(page: Page, volume: number) {
  await page.evaluate(
    (v) => ((window as any).testAudio.gain.gain.value = v),
    volume,
  );
}

test("mobile overview is responsive and permission errors can be retried", async ({
  page,
}) => {
  await audioHarness(page);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "A quieter way forward." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Calibration", exact: true }).click();
  await page.evaluate(() => ((window as any).testMicDenied = true));
  await page.getByRole("button", { name: "Enable microphone / retry" }).click();
  await expect(page.getByRole("alert")).toContainText("permission was denied");
  await page.evaluate(() => ((window as any).testMicDenied = false));
  await page.getByRole("button", { name: "Enable microphone / retry" }).click();
  await expect(
    page.getByText("Microphone active", { exact: true }),
  ).toBeVisible();
});

test("calibrates through Web Audio, survives reload, starts and ends a real-mic demo", async ({
  page,
}) => {
  await audioHarness(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Calibration", exact: true }).click();
  await page.getByRole("button", { name: "Enable microphone / retry" }).click();
  await page.getByRole("button", { name: "Sample background · 2 sec" }).click();
  await expect(
    page.getByRole("button", { name: "Record honk 1 · 3 sec" }),
  ).toBeVisible();
  for (let i = 1; i <= 3; i++) {
    await tone(page, 0.3);
    await page
      .getByRole("button", { name: `Record honk ${i} · 3 sec` })
      .click();
    await expect(
      page.getByRole("button", {
        name: i === 3 ? "Save calibration" : `Record honk ${i + 1} · 3 sec`,
      }),
    ).toBeVisible();
    await tone(page, 0.0001);
  }
  await page.getByRole("button", { name: "Save calibration" }).click();
  await expect(
    page.getByText("Calibration saved. Your phone is ready for a trip."),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Start a trip", exact: false }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Start demo trip" }).click();
  await expect(
    page.getByText("SIMULATED GPS · real microphone and detector", {
      exact: true,
    }),
  ).toBeVisible();
  await tone(page, 0.3);
  await page.waitForTimeout(900);
  await tone(page, 0.0001);
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "End trip & see report" }).click();
  await expect(
    page.getByRole("heading", { name: "Your trip report." }),
  ).toBeVisible();
  await expect(page.locator(".timeline")).toContainText("Likely your horn");
  expect(
    await page.evaluate(() =>
      (window as any).testAudio.stream
        .getTracks()
        .every((t: MediaStreamTrack) => t.readyState === "ended"),
    ),
  ).toBe(true);
  await page.reload();
  await page.getByRole("button", { name: "View report" }).click();
  await expect(page.locator(".timeline")).toContainText("Likely your horn");
  // Real-trip orchestration uses a deterministic position provider for this test.
  await page.getByRole("button", { name: "Back to overview" }).click();
  await page.evaluate(() => {
    const w = window as any;
    w.watchCount = 0;
    w.clearCount = 0;
    navigator.geolocation.watchPosition = ((success: PositionCallback) => {
      w.watchCount++;
      success({
        timestamp: Date.now(),
        coords: { latitude: 12.9716, longitude: 77.5925, accuracy: 5 },
      } as GeolocationPosition);
      return 9;
    }) as typeof navigator.geolocation.watchPosition;
    navigator.geolocation.clearWatch = () => {
      w.clearCount++;
    };
    const start = document.querySelector<HTMLButtonElement>(
      "[data-action=start]",
    )!;
    start.click();
    start.click();
  });
  await expect(page.getByText("LIVE TRIP", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).watchCount)).toBe(1);
  await page.evaluate(() => {
    const track = (window as any).testAudio.stream.getAudioTracks()[0];
    track.stop();
    track.dispatchEvent(new Event("ended"));
  });
  await expect(
    page.getByText("Microphone interrupted", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "End trip & see report" }).click();
  await expect(
    page.getByRole("heading", { name: "Your trip report." }),
  ).toBeVisible();
  expect(await page.evaluate(() => (window as any).clearCount)).toBe(1);
});

for (const dropout of [false, true])
  test(`deterministic scripted demo ${dropout ? "with dropout" : "clean crossing and review"} survives reload`, async ({
    page,
  }) => {
    await page.clock.install();
    await page.goto("/");
    await page.selectOption("#demo-audio", "scripted");
    if (dropout)
      await page.getByLabel("Simulate GPS dropout in first zone").check();
    await page.getByRole("button", { name: "Start demo trip" }).click();
    await expect(
      page.getByText(/SIMULATED AUDIO \+ GPS · deterministic/),
    ).toBeVisible();
    await page.clock.runFor(61000);
    await expect(
      page.getByRole("heading", { name: "Your trip report." }),
    ).toBeVisible();
    await expect(page.locator(".points-badge strong")).toHaveText(
      dropout ? "0" : "1",
    );
    await expect(page.locator(".timeline")).toContainText("Review");
    await expect(page.locator(".timeline")).toContainText("Near marked corner");
    if (dropout)
      await expect(page.locator(".timeline")).toContainText("Unscored");
    await page.reload();
    await page.getByRole("button", { name: "View report" }).click();
    await expect(page.locator(".points-badge strong")).toHaveText(
      dropout ? "0" : "1",
    );
    await page.screenshot({
      path: `test-results/report-${dropout ? "dropout" : "clean"}-mobile.png`,
      fullPage: true,
    });
  });

test("desktop overview and production asset requests stay local", async ({
  page,
  baseURL,
}) => {
  const foreign: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).origin !== new URL(baseURL!).origin)
      foreign.push(r.url());
  });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Calibration", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/overview-desktop.png",
    fullPage: true,
  });
  expect(foreign).toEqual([]);
});
