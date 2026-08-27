import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const component = await readFile(new URL("../app/ai-assistant.tsx", import.meta.url), "utf8");
const client = await readFile(new URL("../app/lib/meetflow-api.ts", import.meta.url), "utf8");
const router = await readFile(new URL("../vercel-api/router.ts", import.meta.url), "utf8");
const ai = await readFile(new URL("../vercel-api/ai.ts", import.meta.url), "utf8");
const database = await readFile(new URL("../vercel-api/db.ts", import.meta.url), "utf8");

test("keeps the AI conversation only in temporary React memory", () => {
  assert.match(component, /useState<AiConversationMessage\[]>/);
  assert.match(component, /Limpar conversa/);
  assert.match(component, /não salva estas mensagens no banco/);
  assert.doesNotMatch(component, /localStorage|sessionStorage|indexedDB/i);
  assert.doesNotMatch(client, /GROQ_API_KEY|AI_GATEWAY_API_KEY|VERCEL_OIDC_TOKEN/);
});

test("sends AI requests through the authenticated server route", () => {
  assert.match(client, /\/ai\/chat/);
  assert.match(router, /chatWithAi\(request, response, user\)/);
  assert.match(ai, /process\.env\.VERCEL_OIDC_TOKEN/);
  assert.match(ai, /https:\/\/ai-gateway\.vercel\.sh\/v1\/chat\/completions/);
  assert.match(ai, /Authorization: `Bearer \$\{provider\.apiKey\}`/);
  assert.doesNotMatch(component, /api\.groq\.com|ai-gateway\.vercel\.sh|GROQ_API_KEY|AI_GATEWAY_API_KEY/);
});

test("uses the Vercel identity and requests zero-data-retention routing", () => {
  assert.match(ai, /process\.env\.AI_GATEWAY_API_KEY\?\.trim\(\) \|\| process\.env\.VERCEL_OIDC_TOKEN\?\.trim\(\)/);
  assert.match(ai, /zeroDataRetention: true/);
  assert.match(ai, /sort: "cost"/);
  assert.match(ai, /AI_GATEWAY_MODEL/);
});

test("stores only an aggregate daily quota and never AI message content", () => {
  assert.match(database, /CREATE TABLE IF NOT EXISTS ai_daily_usage/);
  const usageTable = database.match(/CREATE TABLE IF NOT EXISTS ai_daily_usage \([\s\S]*?\n  \)`/)?.[0] ?? "";
  assert.match(usageTable, /request_count INTEGER/);
  assert.doesNotMatch(usageTable, /message|content|prompt|response/i);
  assert.doesNotMatch(ai, /INSERT INTO (ai_messages|chat_messages)/i);
});

test("protects the free quota and bounds temporary context", () => {
  assert.match(ai, /DEFAULT_DAILY_LIMIT = 20/);
  assert.match(ai, /MAX_CONTEXT_MESSAGES = 12/);
  assert.match(ai, /MAX_CONTEXT_CHARACTERS = 16_000/);
  assert.match(ai, /WHERE ai_daily_usage\.request_count < \$2/);
  assert.match(ai, /status === 429/);
  assert.match(ai, /AbortController/);
});

test("presents the assistant as a polished separate workspace tab", () => {
  const dashboard = component;
  assert.match(dashboard, /MeetFlow IA/);
  assert.match(dashboard, /role="log"/);
  assert.match(dashboard, /Enter para enviar/);
  assert.match(dashboard, /Tentar novamente/);
  assert.match(dashboard, /aria-busy/);
});
