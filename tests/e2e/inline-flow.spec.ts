import { test, expect, type Page } from "@playwright/test";

async function devices(page: Page, delayed = false) {
  await page.addInitScript((delayed) => {
    const w = window as any;
    w.micStarts = 0;
    w.gpsStarts = 0;
    w.gpsStops = 0;
    navigator.geolocation.watchPosition = ((success: PositionCallback) => {
      w.gpsStarts++;
      w.fix = success;
      success({
        timestamp: Date.now(),
        coords: { latitude: 12.9716, longitude: 77.596, accuracy: 5 },
      } as GeolocationPosition);
      return 7;
    }) as typeof navigator.geolocation.watchPosition;
    navigator.geolocation.clearWatch = () => w.gpsStops++;
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: async () => {
        w.micStarts++;
        if (delayed) await new Promise((r) => (w.allowMic = r));
        const c = new AudioContext();
        await c.resume();
        const d = c.createMediaStreamDestination(),
          o = c.createOscillator(),
          g = c.createGain();
        g.gain.value = 0.0001;
        o.frequency.value = 440;
        o.connect(g).connect(d);
        o.start();
        w.audio = { gain: g, stream: d.stream };
        return d.stream;
      },
    });
  }, delayed);
  await page.goto("/");
  await page.getByLabel("Use free on-device AI").uncheck();
}

for (const mode of ["DEMO", "CALIBRATE"])
  test(`${mode}: inline samples open a persistent map with a stationary authored pin`, async ({
    page,
  }) => {
    test.setTimeout(60000);
    await devices(page);
    await page.getByRole("button", { name: mode, exact: true }).click();
    const panel = page.getByRole("region", { name: "Horn calibration" });
    await expect(panel).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => (window as any).micStarts))
      .toBe(1);
    expect(await page.evaluate(() => (window as any).gpsStarts)).toBe(0);
    await expect(
      page.getByRole("heading", { name: "Meet your horn." }),
    ).toHaveCount(0);
    await expect(panel.getByText("Short honk 1", { exact: true })).toHaveCount(
      0,
    );
    const font = await panel.evaluate((e) => getComputedStyle(e).fontFamily);
    expect(font).toBe(
      await page
        .locator(".design-calibrate")
        .first()
        .evaluate((e) => getComputedStyle(e).fontFamily),
    );
    await page
      .getByRole("button", { name: "Sample background · 2 sec" })
      .click();
    for (let i = 1; i <= 3; i++) {
      const capture = page.getByRole("button", {
        name: `Record honk ${i} · 3 sec`,
      });
      await expect(capture).toBeEnabled();
      await expect(panel.locator(".inline-step-heading strong")).toHaveText(
        `Short honk ${i}`,
      );
      if (mode === "DEMO" && i === 3)
        await page.route(
          "**/zones.json",
          (route) => route.fulfill({ status: 503, body: "Unavailable" }),
          { times: 1 },
        );
      await capture.click();
      await page.evaluate(() => {
        const g = (window as any).audio.gain;
        g.gain.value = 0.3;
        setTimeout(() => (g.gain.value = 0.0001), 600);
      });
    }
    if (mode === "DEMO") {
      await expect(page.getByRole("alert")).toContainText(
        "Could not load local zones",
      );
      await page
        .getByRole("button", { name: "Enable microphone / retry" })
        .click();
      await page.getByRole("button", { name: "Open map", exact: true }).click();
    }
    await expect(page.locator("body")).toHaveClass(/map-experience/);
    await expect(page.locator(".pin-stage")).toHaveAttribute(
      "data-ready",
      "true",
    );
    await expect(page.locator(".pin-stage")).toHaveAttribute(
      "data-time",
      "5.00",
      { timeout: 10000 },
    );
    expect(
      await page
        .locator(".design-slide")
        .evaluate((e) => getComputedStyle(e).filter),
    ).toContain("blur");
    expect(await page.evaluate(() => (window as any).gpsStarts)).toBe(
      mode === "DEMO" ? 0 : 1,
    );
    await page.evaluate(() => {
      const w = window as any;
      w.savedMap = document.querySelector(".navigation-map");
      w.savedPin = document.querySelector(".pin-stage canvas");
      w.mapDetached = false;
      new MutationObserver(() => {
        if (!w.savedMap.isConnected) w.mapDetached = true;
      }).observe(document.querySelector("#app")!, {
        childList: true,
        subtree: true,
      });
      if (w.fix)
        w.fix({
          timestamp: Date.now(),
          coords: { latitude: 12.973, longitude: 77.599, accuracy: 5 },
        });
    });
    const before = await page.locator(".pin-stage").boundingBox();
    await page.waitForTimeout(2200);
    expect(await page.locator(".pin-stage").boundingBox()).toEqual(before);
    expect(
      await page.evaluate(() => {
        const w = window as any;
        return (
          !w.mapDetached &&
          w.savedMap === document.querySelector(".navigation-map") &&
          w.savedPin === document.querySelector(".pin-stage canvas")
        );
      }),
    ).toBe(true);
    if (mode === "DEMO") {
      for (let i = 0; i < 2; i++) {
        await page.evaluate(() => {
          const g = (window as any).audio.gain;
          g.gain.value = 0.3;
          setTimeout(() => (g.gain.value = 0.0001), 500);
        });
        await page.waitForTimeout(1200);
      }
      await expect(page.locator(".map-score strong")).toHaveText("1");
    }
    await page.getByRole("button", { name: "End trip & see report" }).click();
    await expect(page.locator(".pin-stage")).toHaveCount(0);
    expect(
      await page.evaluate(
        () => (window as any).audio.stream.getTracks()[0].readyState,
      ),
    ).toBe("ended");
    expect(await page.evaluate(() => (window as any).gpsStops)).toBe(
      mode === "DEMO" ? 0 : 1,
    );
    if (mode === "DEMO") {
      await page.getByRole("button", { name: "Overview", exact: true }).click();
      await expect(page.locator("[data-counter=penalties]")).toHaveText("1");
      await expect(page.locator(".journey-dashboard")).toHaveCount(0);
      await page.reload();
      await expect(page.locator("[data-counter=penalties]")).toHaveText("1");
    }
  });

test("inline cancellation releases a microphone granted after cancellation", async ({
  page,
}) => {
  await devices(page, true);
  await page.getByRole("button", { name: "DEMO", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).micStarts))
    .toBe(1);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.evaluate(() => (window as any).allowMic());
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).audio?.stream.getTracks()[0].readyState,
      ),
    )
    .toBe("ended");
  await expect(page.locator(".inline-step")).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).gpsStarts)).toBe(0);
});

test("denied microphone stays inline and supports retry", async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: async () => {
        throw new DOMException("Denied", "NotAllowedError");
      },
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "CALIBRATE", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(/microphone/i);
  await expect(
    page.getByRole("button", { name: "Enable microphone / retry" }),
  ).toBeEnabled();
  await expect(page.locator(".pin-stage")).toHaveCount(0);
});
