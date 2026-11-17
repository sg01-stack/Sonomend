import { test, expect, type Page } from "@playwright/test";
async function open(page: Page, enabled = true) {
  await page.route("**/api/hosted/status", (r) =>
    r.fulfill({ json: { enabled } }),
  );
  await page.goto("/?tools");
  await page.getByRole("button", { name: "Open optional sound check" }).click();
}
async function microphone(page: Page, delayed = false) {
  await page.addInitScript(
    ({ delayed }) => {
      const w = window as any;
      Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
        value: async () => {
          const ctx = new AudioContext();
          await ctx.resume();
          const dest = ctx.createMediaStreamDestination(),
            osc = ctx.createOscillator();
          osc.connect(dest);
          osc.start();
          w.hostedStream = dest.stream;
          if (delayed)
            await new Promise<void>((resolve) => {
              w.releaseMic = resolve;
            });
          return dest.stream;
        },
      });
    },
    { delayed },
  );
}
test("static host safely disables optional sound check", async ({ page }) => {
  await open(page, false);
  await expect(page.locator("#hosted-status")).toContainText("not configured");
  await expect(page.locator("#hosted-record")).toBeDisabled();
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Calibrate & Start", exact: false }),
  ).toBeVisible();
});
test("real bounded recording, consent, safe result text, clearing and cleanup", async ({
  page,
}) => {
  await microphone(page);
  let uploads = 0;
  await page.route("**/api/hosted/check", async (r) => {
    uploads++;
    const data = r.request().postDataJSON();
    expect(data.consent).toBe(true);
    const wav = Buffer.from(data.audio, "base64");
    expect(wav.length).toBe(96044);
    expect(wav.readUInt32LE(24)).toBe(16000);
    await r.fulfill({
      json: {
        sound: "horn",
        hornCount: 1,
        explanation: "<img src=x onerror=alert(1)>",
      },
    });
  });
  await open(page);
  await page.locator("#hosted-record").click();
  await expect(page.locator("#hosted-result")).toContainText("Clip ready", {
    timeout: 10000,
  });
  expect(uploads).toBe(0);
  await expect(page.locator("#hosted-send")).toBeDisabled();
  expect(
    await page.evaluate(() =>
      (window as any).hostedStream
        .getTracks()
        .every((t: MediaStreamTrack) => t.readyState === "ended"),
    ),
  ).toBe(true);
  await page.locator("#hosted-consent").check();
  await page.locator("#hosted-send").click();
  await expect(page.locator("#hosted-result")).toContainText("<img src=x");
  await expect(page.locator("#hosted-result img")).toHaveCount(0);
  expect(uploads).toBe(1);
  await expect(page.locator("#hosted-consent")).not.toBeChecked();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/sound-check-mobile.png",
    fullPage: true,
  });
  await page.locator("#hosted-clear").click();
  await expect(page.locator("#hosted-playback")).toBeHidden();
  await expect(page.locator("#hosted-send")).toBeDisabled();
  await page.locator("#hosted-record").click();
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  expect(
    await page.evaluate(() =>
      (window as any).hostedStream
        .getTracks()
        .every((t: MediaStreamTrack) => t.readyState === "ended"),
    ),
  ).toBe(true);
});
test("late microphone permission is released after leaving", async ({
  page,
}) => {
  await microphone(page, true);
  await open(page);
  await page.locator("#hosted-record").click();
  await page.waitForFunction(
    () => typeof (window as any).releaseMic === "function",
  );
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.evaluate(() => (window as any).releaseMic());
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).hostedStream
          .getTracks()
          .every((t: MediaStreamTrack) => t.readyState === "ended"),
      ),
    )
    .toBe(true);
});
test("provider failure leaves clip reviewable, retries need fresh consent", async ({
  page,
}) => {
  await microphone(page);
  await page.route("**/api/hosted/check", (r) =>
    r.fulfill({ status: 429, json: { error: "Provider quota unavailable." } }),
  );
  await open(page);
  await page.locator("#hosted-record").click();
  await expect(page.locator("#hosted-result")).toContainText("Clip ready", {
    timeout: 10000,
  });
  await page.locator("#hosted-consent").check();
  await page.locator("#hosted-send").click();
  await expect(page.locator("#hosted-result")).toContainText("Provider quota");
  await expect(page.locator("#hosted-send")).toBeDisabled();
  await expect(page.locator("#hosted-playback")).toBeVisible();
});
