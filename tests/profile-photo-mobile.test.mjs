import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboard = await readFile(new URL("../app/local-app.tsx", import.meta.url), "utf8");
const client = await readFile(new URL("../app/lib/meetflow-api.ts", import.meta.url), "utf8");
const router = await readFile(new URL("../vercel-api/router.ts", import.meta.url), "utf8");
const database = await readFile(new URL("../vercel-api/db.ts", import.meta.url), "utf8");
const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("asks for an optional profile photo only after authentication", () => {
  assert.doesNotMatch(dashboard, /className="avatar-register"/);
  assert.match(dashboard, /!user\.avatarUrl && !user\.profilePhotoPromptedAt/);
  assert.match(dashboard, /ProfilePhotoOnboarding/);
  assert.match(dashboard, /Agora não/);
  assert.match(dashboard, /Essa etapa é opcional/);
  assert.match(dashboard, /image\/jpeg,image\/png,image\/webp/);
  assert.match(dashboard, /3_500_000/);
});

test("persists both uploading and dismissing the first-login prompt", () => {
  assert.match(database, /profile_photo_prompted_at TIMESTAMPTZ/);
  assert.match(database, /ADD COLUMN IF NOT EXISTS profile_photo_prompted_at/);
  assert.match(router, /UPDATE users SET avatar_url = \$1, profile_photo_prompted_at = \$2/);
  assert.match(router, /profile-photo-prompt", "dismiss/);
  assert.match(router, /SET profile_photo_prompted_at = COALESCE/);
  assert.match(client, /dismissProfilePhotoPrompt/);
});

test("provides hardened responsive layouts for registration and the full app", () => {
  assert.match(styles, /\.local-auth-aside \.auth-presentation,.local-auth-aside footer\{display:none!important\}/);
  assert.match(styles, /@media\(max-width:600px\)\{input,select,textarea\{font-size:16px\}/);
  assert.match(styles, /\.profile-photo-onboarding\{width:100%;max-height:96dvh;grid-template-columns:1fr/);
  assert.match(styles, /\.modal,.auth-dialog\{width:100%;max-width:none;max-height:94dvh/);
  assert.match(styles, /calc\(91px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(styles, /overflow-x:clip/);
});
