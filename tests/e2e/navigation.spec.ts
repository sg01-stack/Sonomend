import { test, expect, type Page } from "@playwright/test";
async function devices(page: Page) {
  await page.addInitScript(() => {
    const w = window as any;
    w.gpsStarts = 0;
    w.gpsStops = 0;
    navigator.geolocation.watchPosition = ((
      success: PositionCallback,
      error: PositionErrorCallback,
    ) => {
      w.gpsStarts++;
      w.fix = success;
      w.gpsError = error;
      success({
        timestamp: Date.now(),
        coords: { latitude: 12.9716, longitude: 77.5925, accuracy: 5 },
      } as GeolocationPosition);
      return 42;
    }) as typeof navigator.geolocation.watchPosition;
    navigator.geolocation.clearWatch = () => w.gpsStops++;
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: async () => {
        const c = new AudioContext();
        await c.resume();
        const d = c.createMediaStreamDestination(),
          o = c.createOscillator(),
          g = c.createGain();
        o.frequency.value = 440;
        g.gain.value = 0.0001;
        o.connect(g);
        g.connect(d);
        o.start();
        w.mapAudio = { gain: g, stream: d.stream };
        return d.stream;
      },
    });
  });
}
async function seed(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Calibrate & Start", exact: true })
    .waitFor();
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("sonomend", 1);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("state", "readwrite");
      tx.objectStore("state").put(
        {
          version: 1,
          createdAt: Date.now(),
          noiseRms: 0.001,
          sampleLevels: [0.1, 0.1, 0.1],
          fingerprints: [
            Array(48).fill(1),
            Array(48).fill(1),
            Array(48).fill(1),
          ],
          mode: "Spectral matching",
        },
        "calibration",
      );
      tx.objectStore("state").put(
        { matchThreshold: 0.9, demoDropout: false, aiEnabled: false },
        "settings",
      );
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  await page.reload();
}
function routeData(start = [77.5925, 12.9716]) {
  return {
    code: "Ok",
    routes: [
      {
        distance: 900,
        duration: 180,
        geometry: {
          coordinates: [
            start,
            [77.5945, 12.9716],
            [77.5945, 12.9736],
            [77.598, 12.9736],
          ],
        },
        legs: [
          {
            steps: [
              {
                name: "Start Road",
                maneuver: { type: "depart", modifier: "east", location: start },
              },
              {
                name: "Garden Road",
                maneuver: {
                  type: "turn",
                  modifier: "left",
                  location: [77.5945, 12.9716],
                },
              },
              {
                name: "Library Road",
                maneuver: {
                  type: "turn",
                  modifier: "right",
                  location: [77.5945, 12.9736],
                },
              },
              {
                name: "",
                maneuver: { type: "arrive", location: [77.598, 12.9736] },
              },
            ],
          },
        ],
      },
    ],
  };
}
async function mapProviders(page: Page) {
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.fulfill({
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=",
        "base64",
      ),
    }),
  );
  await page.route("https://nominatim.openstreetmap.org/**", (route) =>
    route.fulfill({
      json: [
        {
          display_name: "Demo destination, Bengaluru",
          lat: "12.9736",
          lon: "77.598",
        },
      ],
    }),
  );
}
test("Calibrate & Start saves once, starts one trip and automatically opens GPS navigation", async ({
  page,
}) => {
  await devices(page);
  await page.goto("/");
  await page.getByLabel("Use free on-device AI").uncheck();
  await page
    .getByRole("button", { name: "Calibrate & Start", exact: true })
    .click();
  await page.getByRole("button", { name: "Enable microphone / retry" }).click();
  await page.getByRole("button", { name: "Sample background · 2 sec" }).click();
  await page.getByRole("button", { name: "Record honk 1 · 3 sec" }).waitFor();
  for (let i = 1; i <= 3; i++) {
    await page.evaluate(() => ((window as any).mapAudio.gain.gain.value = 0.3));
    await page
      .getByRole("button", { name: `Record honk ${i} · 3 sec` })
      .click();
    await page
      .getByRole("button", {
        name: i === 3 ? "Save & Start Trip" : `Record honk ${i + 1} · 3 sec`,
      })
      .waitFor();
    await page.evaluate(
      () => ((window as any).mapAudio.gain.gain.value = 0.0001),
    );
  }
  await page.evaluate(() => {
    const b = document.querySelector<HTMLButtonElement>(
      "[data-action=save-calibration]",
    )!;
    b.click();
    b.click();
  });
  await expect(page.getByText("LIVE TRIP", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Live GPS map" }),
  ).toBeVisible();
  expect(await page.evaluate(() => (window as any).gpsStarts)).toBe(1);
  await page.getByRole("button", { name: "End trip & see report" }).click();
  expect(await page.evaluate(() => (window as any).gpsStops)).toBe(1);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Start a trip" }),
  ).toBeEnabled();
});

test("online navigation searches, advances turns, retains inputs, reroutes and pauses on GPS loss", async ({
  page,
}) => {
  await devices(page);
  await mapProviders(page);
  let requests = 0;
  await page.route("https://router.project-osrm.org/**", (route) => {
    requests++;
    const path = new URL(route.request().url()).pathname.split("/").at(-1)!;
    return route.fulfill({
      json: routeData(path.split(";")[0].split(",").map(Number)),
    });
  });
  const mapRequests: string[] = [];
  page.on("request", (r) => {
    if (/openstreetmap|project-osrm/.test(r.url())) mapRequests.push(r.url());
  });
  await seed(page);
  await page.getByRole("button", { name: "Start a trip" }).click();
  await expect(page.locator("[data-nav=gps]")).toHaveText("GPS ±5 m");
  expect(mapRequests).toHaveLength(0);
  await page.getByRole("button", { name: "Enable online map" }).click();
  await page.getByLabel("Where to?").fill("Library");
  await page.evaluate(() => {
    const state = window as any;
    state.originalMap = document.querySelector(".navigation-map");
    state.mapDetachments = 0;
    state.mapObserver = new MutationObserver((records) => {
      for (const record of records)
        for (const node of record.removedNodes)
          if (node.contains(state.originalMap)) state.mapDetachments++;
    });
    state.mapObserver.observe(document.querySelector("#app"), {
      childList: true,
      subtree: true,
    });
  });
  await page.waitForTimeout(1200);
  await expect(page.getByLabel("Where to?")).toHaveValue("Library");
  expect(
    await page.evaluate(
      () =>
        (window as any).originalMap ===
        document.querySelector(".navigation-map"),
    ),
  ).toBe(true);
  await expect(page.getByLabel("Where to?")).toBeFocused();
  expect(await page.evaluate(() => (window as any).mapDetachments)).toBe(0);
  await page.evaluate(() => (window as any).mapObserver.disconnect());
  await page.getByRole("button", { name: "Find destination" }).click();
  await page
    .getByRole("button", { name: "Demo destination, Bengaluru" })
    .click();
  await expect(page.locator("[data-nav=instruction]")).toHaveText(
    "Turn left onto Garden Road",
  );
  await page.evaluate(() =>
    (window as any).fix({
      timestamp: Date.now(),
      coords: { latitude: 12.9716, longitude: 77.5945, accuracy: 5 },
    }),
  );
  await expect(page.locator("[data-nav=instruction]")).toHaveText(
    "Turn right onto Library Road",
  );
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() =>
      (window as any).fix({
        timestamp: Date.now(),
        coords: { latitude: 12.9756, longitude: 77.5885, accuracy: 5 },
      }),
    );
    await page.waitForTimeout(1100);
  }
  expect(requests).toBe(2);
  await page.evaluate(() => (window as any).gpsError({ code: 2 }));
  await expect(page.locator("[data-nav=instruction]")).toHaveText(
    "GPS unavailable · directions paused",
  );
  await expect(page.locator("[data-nav=points]")).toHaveText("0");
  await page.screenshot({
    path: "test-results/navigation-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "End trip & see report" }).click();
  await expect(
    page.getByRole("heading", { name: "Your trip report." }),
  ).toBeVisible();
  expect(await page.evaluate(() => (window as any).gpsStops)).toBe(1);
});

test("routing failure keeps trip scoring alive and local demo maps require no network", async ({
  page,
}) => {
  await devices(page);
  await mapProviders(page);
  await page.route("https://router.project-osrm.org/**", (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await seed(page);
  await page.getByRole("button", { name: "Start a trip" }).click();
  await page.getByRole("button", { name: "Enable online map" }).click();
  await page.getByLabel("Where to?").fill("12.9736,77.598");
  await page.getByRole("button", { name: "Find destination" }).click();
  await page.getByRole("button", { name: "12.97360, 77.59800" }).click();
  await expect(page.locator(".navigation-error")).toContainText("503");
  await expect(
    page.getByText("Microphone active", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "End trip & see report" }).click();
  await page.getByRole("button", { name: "Back to overview" }).click();
  await page.clock.install();
  await page.selectOption("#demo-audio", "scripted");
  const remote: string[] = [];
  page.on("request", (r) => {
    if (/openstreetmap|project-osrm/.test(r.url())) remote.push(r.url());
  });
  await page.getByRole("button", { name: "Start demo trip" }).click();
  await expect(
    page.getByRole("region", { name: "Live GPS map" }),
  ).toBeVisible();
  await page.clock.runFor(61000);
  await expect(page.locator(".points-badge strong")).toHaveText("0");
  expect(remote).toHaveLength(0);
});

test("stale and inaccurate GPS pause guidance until a fresh accurate fix arrives", async ({
  page,
}) => {
  await devices(page);
  await mapProviders(page);
  let routeRequests = 0;
  await page.route("https://router.project-osrm.org/**", (route) => {
    routeRequests++;
    return route.fulfill({ json: routeData() });
  });
  await seed(page);
  await page.clock.install();
  await page.getByRole("button", { name: "Start a trip" }).click();
  await page.getByRole("button", { name: "Enable online map" }).click();
  await page.getByLabel("Where to?").fill("12.9736,77.598");
  await page.getByRole("button", { name: "Find destination" }).click();
  await page.getByRole("button", { name: "12.97360, 77.59800" }).click();
  await expect(page.locator("[data-nav=instruction]")).toHaveText(
    "Turn left onto Garden Road",
  );
  await page.clock.runFor(6000);
  await expect(page.locator("[data-nav=instruction]")).toHaveText(
    "GPS unavailable · directions paused",
  );
  await page.getByRole("button", { name: "Find destination" }).click();
  await page.getByRole("button", { name: "12.97360, 77.59800" }).click();
  await expect(page.locator(".navigation-error")).toContainText(
    "fresh, accurate GPS",
  );
  expect(routeRequests).toBe(1);
  await page.evaluate(() =>
    (window as any).fix({
      timestamp: Date.now(),
      coords: { latitude: 12.9736, longitude: 77.598, accuracy: 80 },
    }),
  );
  await page.clock.runFor(1000);
  await expect(page.locator("[data-nav=instruction]")).toHaveText(
    "GPS unavailable · directions paused",
  );
  await page.evaluate(() =>
    (window as any).fix({
      timestamp: Date.now(),
      coords: { latitude: 12.9736, longitude: 77.598, accuracy: 5 },
    }),
  );
  await page.clock.runFor(1000);
  await expect(page.locator("[data-nav=instruction]")).toHaveText(
    "You have arrived",
  );
  await expect(page.locator("[data-nav=points]")).toHaveText("0");
  await page.getByRole("button", { name: "End trip & see report" }).click();
  await expect(
    page.getByRole("heading", { name: "Your trip report." }),
  ).toBeVisible();
  expect(await page.evaluate(() => (window as any).gpsStops)).toBe(1);
});
