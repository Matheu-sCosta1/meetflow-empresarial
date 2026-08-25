import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboard = await readFile(new URL("../app/local-app.tsx", import.meta.url), "utf8");
const client = await readFile(new URL("../app/lib/meetflow-api.ts", import.meta.url), "utf8");
const router = await readFile(new URL("../vercel-api/router.ts", import.meta.url), "utf8");
const database = await readFile(new URL("../vercel-api/db.ts", import.meta.url), "utf8");
const auth = await readFile(new URL("../vercel-api/auth.ts", import.meta.url), "utf8");
const email = await readFile(new URL("../vercel-api/email.ts", import.meta.url), "utf8");

test("stores only hashed, expiring, one-time password reset tokens", () => {
  assert.match(database, /CREATE TABLE IF NOT EXISTS password_reset_tokens/);
  assert.match(database, /token_hash VARCHAR\(64\) NOT NULL UNIQUE/);
  assert.match(database, /used_at TIMESTAMPTZ/);
  assert.match(router, /createHash\("sha256"\)/);
  assert.match(router, /randomBytes\(32\)/);
  assert.match(router, /used_at IS NULL AND expires_at > \$3/);
  assert.doesNotMatch(router, /INSERT INTO password_reset_tokens\([^)]*\btoken\b[,)]/);
});

test("does not reveal whether an email address is registered", () => {
  assert.match(router, /PASSWORD_RESET_RESPONSE/);
  assert.match(router, /if \(user\?\.active\)/);
  assert.match(router, /return json\(response, 202, \{ message: PASSWORD_RESET_RESPONSE \}\)/);
  assert.match(dashboard, /Por segurança, não informamos se um e-mail está cadastrado/);
});

test("sends a branded Brevo reset link that expires in sixty minutes", () => {
  assert.match(email, /sendPasswordResetEmail/);
  assert.match(email, /Redefina sua senha do MeetFlow/);
  assert.match(router, /PASSWORD_RESET_EXPIRES_MINUTES = 60/);
  assert.match(router, /VERCEL_PROJECT_PRODUCTION_URL/);
  assert.match(router, /url\.hash = new URLSearchParams/);
  assert.match(email, /process\.env\.BREVO_API_KEY/);
  assert.doesNotMatch(dashboard, /BREVO_API_KEY/);
});

test("supports request and completion from the login screen", () => {
  assert.match(client, /\/auth\/forgot-password/);
  assert.match(client, /\/auth\/reset-password/);
  assert.match(dashboard, /Esqueci minha senha/);
  assert.match(dashboard, /reset_token/);
  assert.match(dashboard, /has\("reset_token"\)/);
  assert.match(dashboard, /Crie uma nova senha/);
  assert.match(dashboard, /Entrar com a nova senha/);
});

test("invalidates existing sessions after an email password reset", () => {
  assert.match(database, /auth_version INTEGER NOT NULL DEFAULT 0/);
  assert.match(router, /auth_version = u\.auth_version \+ 1/);
  assert.match(auth, /av: user\.authVersion \?\? 0/);
  assert.match(auth, /Number\(rows\[0\]\.auth_version\) === subject\.authVersion/);
});
