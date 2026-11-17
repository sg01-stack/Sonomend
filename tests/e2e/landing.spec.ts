import { test, expect } from "@playwright/test";
test("annotated landing uses gray field, pink pointer trail and supplied GLB", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.locator(".megaphone-stage")).toHaveAttribute(
    "data-ready",
    "true",
  );
  const pink = () =>
    page.locator(".reactive-field").evaluate((c: HTMLCanvasElement) => {
      const a = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 0; i < a.length; i += 4) if (a[i] > a[i + 1] + 8) n++;
      return n;
    });
  expect(await pink()).toBe(0);
  await page.mouse.move(1100, 250);
  await page.mouse.move(950, 280, { steps: 8 });
  await expect.poll(pink).toBeGreaterThan(20);
  await expect(page.locator(".design-title h1")).toHaveText("Sonomend.");
  await expect(page.locator(".design-cells p")).toHaveText([
    "penalties",
    "propers",
    "rewards",
  ]);
  await page.getByRole("button", { name: "CALIBRATE", exact: true }).click();
  await expect(page.locator(".design-slide")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Meet your horn." }),
  ).toBeVisible();
});
test("reduced motion keeps reveals still and mobile has no horizontal overflow", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  expect(
    await page
      .locator(".design-title h1 span")
      .evaluate((e) => getComputedStyle(e).animationName),
  ).toBe("none");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("individual meshes reveal immediately, hold, and respond to keyboard rotation", async ({
  page,
}) => {
  await page.goto("/");
  const stage = page.locator(".megaphone-stage");
  await expect(stage).toHaveAttribute("data-ready", "true");
  await expect(stage.locator("img,video")).toHaveCount(0);
  await expect(stage).toHaveAttribute("data-capsules", "6");
  const start = Number(await stage.getAttribute("data-reveal-time"));
  expect(start).toBeLessThan(2.5);
  await expect
    .poll(async () => Number(await stage.getAttribute("data-reveal-time")))
    .toBe(2.5);
  await stage.focus();
  const before = await stage.screenshot();
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(400);
  const after = await stage.screenshot();
  expect(before.equals(after)).toBe(false);
  await page.keyboard.press("Enter");
  await expect
    .poll(async () => Number(await stage.getAttribute("data-reveal-time")))
    .toBeLessThan(1);
});
