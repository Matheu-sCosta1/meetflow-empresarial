import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboard = await readFile(new URL("../app/local-app.tsx", import.meta.url), "utf8");
const client = await readFile(new URL("../app/lib/meetflow-api.ts", import.meta.url), "utf8");
const router = await readFile(new URL("../vercel-api/router.ts", import.meta.url), "utf8");
const database = await readFile(new URL("../vercel-api/db.ts", import.meta.url), "utf8");
const email = await readFile(new URL("../vercel-api/email.ts", import.meta.url), "utf8");

test("stores only hashed, expiring and revocable team invitation tokens", () => {
  assert.match(database, /CREATE TABLE IF NOT EXISTS team_invitations/);
  assert.match(database, /token_hash VARCHAR\(64\) NOT NULL UNIQUE/);
  assert.match(database, /expires_at TIMESTAMPTZ NOT NULL/);
  assert.match(database, /accepted_at TIMESTAMPTZ/);
  assert.match(database, /revoked_at TIMESTAMPTZ/);
  assert.match(router, /secureTokenHash\(rawToken\)/);
  assert.match(router, /randomBytes\(32\)/);
  assert.doesNotMatch(database, /\btoken VARCHAR/);
});

test("invited collaborators create their own password from a one-time email link", () => {
  assert.match(email, /sendTeamInvitationEmail/);
  assert.match(email, /Aceitar convite e criar senha/);
  assert.match(router, /invite_token/);
  assert.match(router, /auth", "invitations", "inspect/);
  assert.match(router, /auth", "invitations", "accept/);
  assert.match(client, /inspectInvitation/);
  assert.match(client, /acceptInvitation/);
  assert.match(dashboard, /InvitationAcceptForm/);
  assert.doesNotMatch(dashboard, /Senha inicial/);
});

test("supports owner, administrator, manager and member roles with guarded administration", () => {
  assert.match(client, /"OWNER" \| "ADMIN" \| "MANAGER" \| "MEMBER"/);
  assert.match(router, /VALUES \(\$1,\$2,\$3,\$4,\$5,'OWNER'/);
  assert.match(router, /Somente o proprietário pode convidar outro administrador/);
  assert.match(router, /O proprietário da empresa não pode ser desativado/);
  assert.match(database, /SET role = 'OWNER'/);
});

test("records and displays administrative access events", () => {
  assert.match(database, /CREATE TABLE IF NOT EXISTS audit_events/);
  assert.match(router, /TEAM_INVITATION_CREATED/);
  assert.match(router, /TEAM_MEMBER_ROLE_CHANGED/);
  assert.match(router, /TEAM_MEMBER_DEACTIVATED/);
  assert.match(client, /auditLog\(\)/);
  assert.match(dashboard, /Histórico administrativo/);
});

