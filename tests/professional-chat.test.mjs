import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboard = await readFile(new URL("../app/local-app.tsx", import.meta.url), "utf8");
const clientApi = await readFile(new URL("../app/lib/meetflow-api.ts", import.meta.url), "utf8");
const router = await readFile(new URL("../vercel-api/router.ts", import.meta.url), "utf8");
const realtime = await readFile(new URL("../vercel-api/realtime.ts", import.meta.url), "utf8");
const database = await readFile(new URL("../vercel-api/db.ts", import.meta.url), "utf8");

test("keeps the Ably API key on the server and issues subscribe-only user tokens", () => {
  assert.match(realtime, /process\.env\.ABLY_API_KEY/);
  assert.doesNotMatch(dashboard, /ABLY_API_KEY/);
  assert.doesNotMatch(clientApi, /ABLY_API_KEY/);
  assert.match(realtime, /\["subscribe"\]/);
  assert.doesNotMatch(realtime, /\["publish"\]/);
});

test("provides a safe polling fallback when realtime is not configured", () => {
  assert.match(dashboard, /realtimeState === "live" \? 30000 : 5000/);
  assert.match(dashboard, /setRealtimeState\("fallback"\)/);
  assert.match(router, /realtimeConfigured\(\) \? "configured" : "fallback"/);
});

test("supports professional chat actions and unread tracking", () => {
  assert.match(clientApi, /replyToId/);
  assert.match(clientApi, /editMessage/);
  assert.match(clientApi, /deleteMessage/);
  assert.match(clientApi, /markChannelRead/);
  assert.match(router, /reply_to_id/);
  assert.match(router, /edited_at/);
  assert.match(router, /deleted_at/);
  assert.match(database, /CREATE TABLE IF NOT EXISTS chat_channel_reads/);
});

test("creates internal notifications without exposing another organization", () => {
  assert.match(database, /CREATE TABLE IF NOT EXISTS notifications/);
  assert.match(router, /WHERE user_id = \$1 AND organization_id = \$2/);
  assert.match(router, /notification\.created/);
  assert.match(dashboard, /notification-popover/);
});
