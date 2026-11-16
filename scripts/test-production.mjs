// Own the production server in this process, so Windows cleanup needs no process-tree shell commands.
import { createServer } from "../server/index.mjs";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const server = createServer({ config: {} });
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const child = spawn(
  process.execPath,
  [
    require.resolve("@playwright/test/cli"),
    "test",
    "--config=playwright.production.config.ts",
    ...process.argv.slice(2),
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      SONOMEND_TEST_URL: "http://127.0.0.1:" + server.address().port,
    },
  },
);
child.on("error", (error) => {
  console.error(error);
  server.close();
  process.exitCode = 1;
});
child.on("exit", (code) => {
  server.closeAllConnections();
  server.close();
  process.exitCode = code ?? 1;
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    child.kill();
    server.closeAllConnections();
    server.close();
    process.exitCode = 1;
  });
