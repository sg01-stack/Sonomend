import { test, expect } from "@playwright/test";
test("Demo uses calibrated microphone and simulated GPS without requesting location", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const w = window as any;
    w.gpsStarts = 0;
    navigator.geolocation.watchPosition = (() => {
      w.gpsStarts++;
      throw Error("No GPS for demo");
    }) as any;
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: async () => {
        const c = new AudioContext();
        await c.resume();
        const d = c.createMediaStreamDestination(),
          o = c.createOscillator(),
          g = c.createGain();
        g.gain.value = 0.0001;
        o.connect(g).connect(d);
        o.start();
        return d.stream;
      },
    });
  });
  await page.goto("/");
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((r, j) => {
      const q = indexedDB.open("sonomend", 1);
      q.onsuccess = () => r(q.result);
      q.onerror = j;
    });
    await new Promise<void>((r, j) => {
      const tx = db.transaction("state", "readwrite");
      tx.objectStore("state").put(
        {
          version: 1,
          createdAt: Date.now(),
          noiseRms: 0.001,
          fingerprints: [
            [1, 0, 0, 0],
            [1, 0, 0, 0],
            [1, 0, 0, 0],
          ],
          sampleLevels: [0.1, 0.1, 0.1],
          mode: "Spectral matching",
        },
        "calibration",
      );
      tx.objectStore("state").put(
        { matchThreshold: 0.9, demoDropout: false, aiEnabled: false },
        "settings",
      );
      tx.oncomplete = () => r();
      tx.onerror = j;
    });
    db.close();
  });
  await page.reload();
  await page.getByRole("button", { name: "DEMO", exact: true }).click();
  await expect(
    page.getByText("SIMULATED GPS · real microphone and detector", {
      exact: false,
    }),
  ).toBeVisible();
  expect(await page.evaluate(() => (window as any).gpsStarts)).toBe(0);
  await expect(
    page.getByRole("region", { name: "Live GPS map" }),
  ).toBeVisible();
  await expect(page.locator(".leaflet-tooltip")).toContainText("Marked corner");
  await expect(page.locator(".map-score")).toContainText("penalties");
  await page.getByRole("button", { name: "End trip & see report" }).click();
});
test("daily counters survive reload and unlock one reward at 100 points", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const q = indexedDB.open("sonomend", 1);
    const db = await new Promise<IDBDatabase>(
      (r) => (q.onsuccess = () => r(q.result)),
    );
    await new Promise<void>((r) => {
      const tx = db.transaction(["state", "trips"], "readwrite");
      for (let i = 1; i <= 20; i++) {
        const at = Date.now() - i * 86400000;
        tx.objectStore("trips").put({
          id: "day-" + i,
          scoringVersion: 2,
          startedAt: at,
          endedAt: at + 10000,
          mode: "live",
          detector: "Spectral matching",
          zones: [],
          crossings: [],
          events: [],
          gaps: [],
          fixes: [{ at, latitude: 0, longitude: 0, accuracy: 5 }],
        });
      }
      tx.oncomplete = () => r();
    });
    db.close();
  });
  await page.reload();
  await expect(page.locator("[data-counter=penalties]")).toHaveText("0");
  await expect(page.locator("[data-counter=propers]")).toHaveText("100");
  await expect(page.locator("[data-counter=rewards]")).toHaveText("1");
  await page.reload();
  await expect(page.locator("[data-counter=rewards]")).toHaveText("1");
});
test("capsules wiggle but reflections settle after the reveal and resume on interaction", async ({
  page,
}) => {
  await page.goto("/");
  const stage = page.locator(".megaphone-stage");
  await expect(stage).toHaveAttribute("data-ready", "true");
  await expect(stage).toHaveAttribute("data-wiggle", "on");
  await expect(stage).toHaveAttribute("data-reflection", "moving");
  await expect(stage).toHaveAttribute("data-reflection", "still", {
    timeout: 8000,
  });
  await stage.focus();
  await page.keyboard.press("ArrowRight");
  await expect(stage).toHaveAttribute("data-reflection", "moving");
});

test("Demo without calibration opens calibration and explains the simulated route", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "DEMO", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Meet your horn." }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Calibrate your horn, then Save & Start Trip opens the moving demo without GPS.",
      { exact: true },
    ),
  ).toBeVisible();
});
