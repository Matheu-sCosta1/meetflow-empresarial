import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboard = await readFile(new URL("../app/local-app.tsx", import.meta.url), "utf8");
const clientApi = await readFile(new URL("../app/lib/meetflow-api.ts", import.meta.url), "utf8");
const router = await readFile(new URL("../vercel-api/router.ts", import.meta.url), "utf8");
const realtime = await readFile(new URL("../vercel-api/realtime.ts", import.meta.url), "utf8");
const database = await readFile(new URL("../vercel-api/db.ts", import.meta.url), "utf8");

test("keeps each company independent while a user joins a shared community channel", () => {
  assert.match(database, /scope VARCHAR\(20\).*DEFAULT 'ORGANIZATION'/);
  assert.match(router, /c\.scope = 'COMMUNITY'.*chat_channel_members/s);
  assert.match(router, /COMMUNITY_INVITATION_ACCEPTED/);
  assert.doesNotMatch(router, /UPDATE users SET organization_id.*COMMUNITY/i);
  assert.match(dashboard, /Agenda, equipe, IA, status e configurações continuam separados/);
});

test("protects reusable community links with hashing, expiry and a participant limit", () => {
  assert.match(database, /CREATE TABLE IF NOT EXISTS chat_channel_invitations/);
  assert.match(database, /token_hash VARCHAR\(64\) NOT NULL UNIQUE/);
  assert.match(router, /secureTokenHash\(rawToken\)/);
  assert.match(router, /expires_at > \$1 AND use_count < max_uses/);
  assert.match(router, /COMMUNITY_INVITATION_MAX_USES = 100/);
  assert.doesNotMatch(database, /raw_token|invitation_url/i);
});

test("requires a normal authenticated account before accepting the group link", () => {
  const authPosition = router.indexOf("const user = await authenticated(request.headers)");
  const acceptRoutePosition = router.indexOf('samePath(path, "chat", "community-invitations", "accept")');
  assert.ok(authPosition >= 0 && acceptRoutePosition > authPosition);
  assert.match(dashboard, /Entre na sua conta ou crie sua empresa/);
  assert.match(dashboard, /acceptCommunityInvitation\(token\)/);
  assert.match(dashboard, /community_token/);
  assert.match(clientApi, /community-invitations|createCommunityInvitation/);
});

test("uses membership-scoped realtime channels across companies", () => {
  assert.match(realtime, /meetflow:chat:\$\{channelId\}/);
  assert.match(realtime, /capability\[chatChannel\(channelId\)\] = \["subscribe"\]/);
  assert.match(router, /community_member\.user_id = \$2/);
  assert.match(dashboard, /api\.chatRealtimeChannel\(channel\.id\)/);
});

test("identifies the sender company and exposes a professional share flow", () => {
  assert.match(router, /sender_org\.name AS sender_organization_name/);
  assert.match(dashboard, /message\.senderOrganizationName/);
  assert.match(dashboard, /Compartilhar link/);
  assert.match(dashboard, /Até 100 participantes/);
  assert.match(dashboard, /navigator\.share/);
});
