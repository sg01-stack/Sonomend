import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createHostedHandler,
  validWav,
  parseOpinion,
  MAX_BODY,
} from "../../server/hosted-api.mjs";
import { createServer } from "../../server/index.mjs";
const config = {
  SONOMEND_HOSTED_ENABLED: "true",
  SONOMEND_FREE_TIER_CONFIRMED: "true",
  SONOMEND_GEMINI_KEY: "test-secret",
  SONOMEND_GEMINI_MODEL: "test-model",
};
function wav(seconds = 3) {
  const b = Buffer.alloc(44 + seconds * 32000);
  b.write("RIFF");
  b.writeUInt32LE(b.length - 8, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(16000, 24);
  b.writeUInt32LE(32000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(b.length - 44, 40);
  return b.toString("base64");
}
const opinion = (
  value = { sound: "horn", hornCount: 1, explanation: "A short horn." },
) => ({
  candidates: [
    {
      finishReason: "STOP",
      content: { parts: [{ text: JSON.stringify(value) }] },
    },
  ],
});
const req = (body = { consent: true, audio: wav() }, headers = {}) =>
  new Request("https://app.test/api/hosted/check", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://app.test",
      ...headers,
    },
    body: JSON.stringify(body),
  });
test("canonical WAV only, bounded duration and headers", () => {
  for (const s of [1, 3, 4]) assert.equal(validWav(wav(s)), true);
  for (const s of [0, 5]) assert.equal(validWav(wav(s)), false);
  const b = Buffer.from(wav(), "base64");
  b.writeUInt32LE(48000, 24);
  assert.equal(validWav(b.toString("base64")), false);
  assert.equal(validWav("not audio"), false);
});
test("strict model result rejects blocked, inconsistent and malformed output", () => {
  assert.equal(parseOpinion(opinion()).hornCount, 1);
  for (const value of [
    { sound: "horn", hornCount: 0, explanation: "x" },
    { sound: "other", hornCount: 1, explanation: "x" },
    { sound: "uncertain", hornCount: 13, explanation: "x" },
    null,
  ])
    assert.throws(() => parseOpinion(opinion(value)));
  assert.throws(() =>
    parseOpinion({ candidates: [{ finishReason: "SAFETY" }] }),
  );
});
test("disabled defaults expose no secret and never call provider", async () => {
  const h = createHostedHandler({
    fetcher: () => {
      throw Error("should not fetch");
    },
  });
  const response = await h(new Request("https://app.test/api/hosted/status"));
  assert.equal((await response.json()).enabled, false);
  assert.equal((await h(req())).status, 503);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});
test("consent, content type, origin and oversized streaming bodies rejected", async () => {
  const h = createHostedHandler({
    fetcher: () => {
      throw Error("should not fetch");
    },
  });
  assert.equal((await h(req({ audio: wav() }), config)).status, 400);
  assert.equal(
    (await h(req(undefined, { Origin: "https://evil.test" }), config)).status,
    403,
  );
  assert.equal(
    (await h(req(undefined, { "Content-Type": "text/plain" }), config)).status,
    415,
  );
  assert.equal(
    (await h(req({ consent: true, audio: "x".repeat(MAX_BODY) }), config))
      .status,
    413,
  );
});
test("provider receives WAV and server key; cooldown and daily cap hold", async () => {
  let now = 0,
    calls = 0;
  const h = createHostedHandler({
    now: () => now,
    fetcher: async (url, init) => {
      calls++;
      assert.match(url, /test-model:generateContent$/);
      assert.equal(init.headers["x-goog-api-key"], "test-secret");
      const body = JSON.parse(init.body);
      assert.equal(validWav(body.contents[0].parts[1].inlineData.data), true);
      return Response.json(opinion());
    },
  });
  for (let i = 0; i < 40; i++) {
    assert.equal((await h(req(), config)).status, 200);
    assert.equal((await h(req(), config)).status, 429);
    now += 30000;
  }
  assert.equal((await h(req(), config)).status, 429);
  assert.equal(calls, 40);
  now = 86400000;
  assert.equal((await h(req(), config)).status, 200);
});
test("single inflight request; errors release lock, never retry", async () => {
  let release,
    calls = 0,
    now = 0;
  const h = createHostedHandler({
    now: () => now,
    fetcher: () => {
      calls++;
      return new Promise((resolve) => (release = resolve));
    },
  });
  const first = h(req(), config);
  await new Promise((r) => setImmediate(r));
  now = 40000;
  assert.equal((await h(req(), config)).status, 429);
  release(new Response("", { status: 500 }));
  assert.equal((await first).status, 502);
  assert.equal(calls, 1);
});
test("429 respects provider cooldown and malformed result fails closed", async () => {
  let now = 0,
    calls = 0;
  const h = createHostedHandler({
    now: () => now,
    fetcher: async () => {
      calls++;
      return calls === 1
        ? new Response("", { status: 429, headers: { "Retry-After": "120" } })
        : Response.json(opinion(null));
    },
  });
  assert.equal((await h(req(), config)).status, 429);
  now = 90000;
  assert.equal((await h(req(), config)).status, 429);
  assert.equal(calls, 1);
  now = 121000;
  assert.equal((await h(req(), config)).status, 502);
});
test("Node adapter supports explicit HTTPS origin and serves only dist", async (t) => {
  const server = createServer({
    config: { ...config, SONOMEND_PUBLIC_ORIGIN: "https://app.test" },
    handler: createHostedHandler({
      fetcher: async () => Response.json(opinion()),
    }),
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => new Promise((r) => server.close(r)));
  const base = "http://127.0.0.1:" + server.address().port;
  const response = await fetch(base + "/api/hosted/check", {
    method: "POST",
    headers: { Origin: "https://app.test", "Content-Type": "application/json" },
    body: JSON.stringify({ consent: true, audio: wav() }),
  });
  assert.equal(response.status, 200);
  assert.equal(
    (
      await fetch(base + "/api/hosted/check", {
        method: "POST",
        headers: {
          Origin: "https://evil.test",
          "Content-Type": "application/json",
        },
        body: "{}",
      })
    ).status,
    403,
  );
  for (const path of [
    "/.env",
    "/%2e%2e%5cpackage.json",
    "/server/hosted-api.mjs",
  ])
    assert.notEqual((await fetch(base + path)).status, 200);
  assert.equal((await fetch(base + "/api/hosted/status")).status, 200);
});

test("canceled request cannot start provider work", async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  const h = createHostedHandler({
    fetcher: async () => {
      calls++;
      return Response.json(opinion());
    },
  });
  const request = new Request(req(), { signal: controller.signal });
  assert.equal((await h(request, config)).status, 408);
  assert.equal(calls, 0);
});
test("Worker adapter isolates API paths from static assets", async () => {
  const { default: worker } = await import("../../server/worker.mjs");
  let assets = 0;
  const env = {
    ASSETS: {
      fetch: async () => {
        assets++;
        return new Response("asset");
      },
    },
  };
  assert.equal(
    (
      await (
        await worker.fetch(
          new Request("https://app.test/api/hosted/status"),
          env,
        )
      ).json()
    ).enabled,
    false,
  );
  assert.equal(assets, 0);
  assert.equal(
    await (await worker.fetch(new Request("https://app.test/"), env)).text(),
    "asset",
  );
  assert.equal(assets, 1);
});
test("Node returns 413 for oversized chunked requests", async (t) => {
  const http = await import("node:http");
  const server = createServer({ config });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => new Promise((r) => server.close(r)));
  const status = await new Promise((resolve, reject) => {
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port: server.address().port,
        path: "/api/hosted/check",
        method: "POST",
        headers: { "Content-Type": "application/json" },
      },
      (response) => {
        response.resume();
        resolve(response.statusCode);
      },
    );
    request.on("error", reject);
    request.write("x".repeat(100000));
    request.end("x".repeat(100000));
  });
  assert.equal(status, 413);
});
