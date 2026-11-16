import http from "node:http";
import { readFile, realpath } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { createHostedHandler, MAX_BODY } from "./hosted-api.mjs";
const root = resolve(fileURLToPath(new URL("../dist", import.meta.url)));
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".txt": "text/plain; charset=utf-8",
};
export function createServer({
  config = process.env,
  handler = createHostedHandler(),
} = {}) {
  // Explicit external origin for HTTPS reverse proxies; never trust forwarded headers.
  const publicOrigin = config.SONOMEND_PUBLIC_ORIGIN
    ? new URL(config.SONOMEND_PUBLIC_ORIGIN).origin
    : undefined;
  const server = http.createServer(async (req, res) => {
    const controller = new AbortController();
    res.on("close", () => {
      if (!res.writableEnded) controller.abort();
    });
    res.setHeader("X-Content-Type-Options", "nosniff");
    try {
      if (!req.url?.startsWith("/") || req.url.startsWith("//")) {
        res.writeHead(400);
        res.end();
        return;
      }
      const url = new URL(
        req.url,
        publicOrigin ?? "http://" + (req.headers.host ?? "localhost"),
      );
      if (url.pathname.startsWith("/api/hosted/")) {
        if (Number(req.headers["content-length"]) > MAX_BODY) {
          res.writeHead(413, {
            "Content-Type": "application/json",
            Connection: "close",
            "Cache-Control": "no-store",
          });
          res.end(JSON.stringify({ error: "Clip is too large" }));
          return;
        }
        const headers = new Headers();
        for (const [key, value] of Object.entries(req.headers))
          if (value !== undefined)
            headers.set(key, Array.isArray(value) ? value.join(", ") : value);
        const body =
          req.method === "GET" || req.method === "HEAD"
            ? undefined
            : Readable.toWeb(req);
        const request = new Request(url, {
          method: req.method,
          headers,
          body,
          duplex: "half",
          signal: controller.signal,
        });
        const response = await handler(request, config);
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(Buffer.from(await response.arrayBuffer()));
        return;
      }
      if (req.method !== "GET" && req.method !== "HEAD") {
        res.writeHead(405, { Allow: "GET, HEAD" });
        res.end();
        return;
      }
      const decoded = decodeURIComponent(
        url.pathname === "/" ? "/index.html" : url.pathname,
      );
      if (
        decoded.includes("\\") ||
        decoded.includes("\0") ||
        decoded.split("/").some((s) => s.startsWith("."))
      ) {
        res.writeHead(403);
        res.end();
        return;
      }
      const path = resolve(root, "." + decoded),
        actualRoot = await realpath(root),
        actualPath = await realpath(path);
      if (
        !path.startsWith(root + sep) ||
        !actualPath.startsWith(actualRoot + sep)
      ) {
        res.writeHead(403);
        res.end();
        return;
      }
      const data = await readFile(actualPath);
      res.writeHead(200, {
        "Content-Type": mime[extname(path)] ?? "application/octet-stream",
        "Cache-Control": "no-cache",
      });
      res.end(req.method === "HEAD" ? undefined : data);
    } catch {
      if (!res.headersSent) res.writeHead(404);
      res.end();
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  return server;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const server = createServer();
  server.listen(
    Number(process.env.PORT ?? 8787),
    process.env.HOST ?? "127.0.0.1",
    () =>
      console.log(
        "Sonomend app/API listening on port " + server.address().port,
      ),
  );
}
