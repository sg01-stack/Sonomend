import { createHostedHandler } from "./hosted-api.mjs";
const handle = createHostedHandler();
export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname.startsWith("/api/hosted/"))
      return handle(request, env);
    return env.ASSETS.fetch(request);
  },
};
