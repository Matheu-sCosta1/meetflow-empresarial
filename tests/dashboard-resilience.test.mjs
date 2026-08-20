import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboard = await readFile(new URL("../app/local-app.tsx", import.meta.url), "utf8");

test("isolates dashboard page failures and switches views without a browser reload", () => {
  assert.match(dashboard, /class DashboardErrorBoundary/);
  assert.match(dashboard, /DashboardErrorBoundary key=\{view\}/);
  assert.match(dashboard, /setView\(next\)/);
  assert.doesNotMatch(dashboard, /window\.location\.reload\(\)/);
});

test("keeps chat polling inside the chat page and scrolls only the message list", () => {
  assert.match(dashboard, /view !== "chat" \|\| !activeChannel/);
  assert.match(dashboard, /messageListRef\.current/);
  assert.doesNotMatch(dashboard, /scrollIntoView/);
});

test("shows status errors in the modal and prepares uploads before publishing", () => {
  assert.match(dashboard, /prepareStatusFile\(file\)/);
  assert.match(dashboard, /setLocalError\(message\)/);
  assert.match(dashboard, /Fotos são otimizadas automaticamente/);
});
