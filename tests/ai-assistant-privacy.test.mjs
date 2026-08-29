import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const component = await readFile(new URL("../app/ai-assistant.tsx", import.meta.url), "utf8");
const client = await readFile(new URL("../app/lib/meetflow-api.ts", import.meta.url), "utf8");
const router = await readFile(new URL("../vercel-api/router.ts", import.meta.url), "utf8");
const ai = await readFile(new URL("../vercel-api/ai.ts", import.meta.url), "utf8");
const database = await readFile(new URL("../vercel-api/db.ts", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../app/local-app.tsx", import.meta.url), "utf8");

test("keeps the AI conversation only in temporary React memory", () => {
  assert.match(component, /useState<AiConversationMessage\[]>/);
  assert.match(component, /Limpar conversa/);
  assert.match(component, /não salva estas mensagens/);
  assert.doesNotMatch(component, /localStorage|sessionStorage|indexedDB/i);
  assert.doesNotMatch(client, /OPENROUTER_API_KEY|GROQ_API_KEY|AI_GATEWAY_API_KEY|VERCEL_OIDC_TOKEN/);
});

test("sends AI requests through the authenticated server route", () => {
  assert.match(client, /\/ai\/chat/);
  assert.match(router, /chatWithAi\(request, response, user\)/);
  assert.match(ai, /process\.env\.VERCEL_OIDC_TOKEN/);
  assert.match(ai, /https:\/\/ai-gateway\.vercel\.sh\/v1\/chat\/completions/);
  assert.match(ai, /Authorization: `Bearer \$\{provider\.apiKey\}`/);
  assert.doesNotMatch(component, /openrouter\.ai|api\.groq\.com|ai-gateway\.vercel\.sh|OPENROUTER_API_KEY|GROQ_API_KEY|AI_GATEWAY_API_KEY/);
});

test("prefers the privacy-routed free OpenRouter model and keeps fallbacks", () => {
  assert.match(ai, /process\.env\.OPENROUTER_API_KEY\?\.trim\(\)/);
  assert.match(ai, /process\.env\.OPENROUTER_MODEL\?\.trim\(\)/);
  assert.match(ai, /openrouter\/free/);
  assert.match(ai, /https:\/\/openrouter\.ai\/api\/v1\/chat\/completions/);
  assert.match(ai, /data_collection: "deny"/);
  assert.doesNotMatch(ai, /zdr: true/);
  assert.match(ai, /sort: "throughput"/);
  assert.ok(ai.indexOf("process.env.OPENROUTER_API_KEY?.trim()", ai.indexOf("function aiProvider"))
    < ai.indexOf("process.env.GROQ_API_KEY?.trim()", ai.indexOf("function aiProvider")));
  assert.match(ai, /process\.env\.GROQ_API_KEY\?\.trim\(\)/);
  assert.match(ai, /process\.env\.GROQ_MODEL\?\.trim\(\)/);
  assert.match(ai, /https:\/\/api\.groq\.com\/openai\/v1\/chat\/completions/);
  assert.ok(ai.indexOf("process.env.GROQ_API_KEY?.trim()", ai.indexOf("function aiProvider"))
    < ai.indexOf("process.env.AI_GATEWAY_API_KEY?.trim()", ai.indexOf("function aiProvider")));
  assert.match(ai, /process\.env\.AI_GATEWAY_API_KEY\?\.trim\(\)/);
  assert.match(ai, /process\.env\.VERCEL_OIDC_TOKEN\?\.trim\(\)/);
  assert.match(ai, /request\.headers\["x-vercel-oidc-token"\]/);
  assert.match(ai, /aiProvider\(request\)/);
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

test("consults internal company data only within the authenticated authorization scope", () => {
  assert.match(ai, /authorizedCompanyContext\(user/);
  assert.match(ai, /meeting\.organization_id = \$1/);
  assert.match(ai, /organization_id = \$1 ORDER BY active DESC/);
  assert.match(ai, /status\.organization_id = \$1/);
  assert.match(ai, /channel\.organization_id = \$1/);
  assert.match(ai, /member\.user_id = \$2/);
  assert.match(ai, /DADOS AUTORIZADOS DO MEETFLOW/);
  assert.match(ai, /sources: companyContext\.sources/);
  assert.doesNotMatch(ai, /password_hash|reset_token|invitation_token/i);
  assert.match(component, /Consulta interna protegida/);
});

test("keeps general questions general and queries company context only when relevant", () => {
  assert.match(ai, /if \(!wantsMeetings && !wantsTeam && !wantsStatuses && !wantsChat && !wantsProfile\) return \{ sources: \[\], content: "" \}/);
  assert.match(component, /Quais são as próximas reuniões\?/);
  assert.match(component, /Explique um assunto/);
});

test("protects the free quota and bounds temporary context", () => {
  assert.match(ai, /DEFAULT_DAILY_LIMIT = 20/);
  assert.match(ai, /MAX_CONTEXT_MESSAGES = 12/);
  assert.match(ai, /MAX_CONTEXT_CHARACTERS = 16_000/);
  assert.match(ai, /WHERE ai_daily_usage\.request_count < \$2/);
  assert.match(ai, /status === 429/);
  assert.match(ai, /AbortController/);
});

test("presents the assistant as a polished floating conversation", () => {
  assert.match(component, /ai-fab/);
  assert.match(component, /role="dialog"/);
  assert.match(component, /aria-modal="true"/);
  assert.match(component, /role="log"/);
  assert.match(component, /Enter envia/);
  assert.match(component, /Tentar novamente/);
  assert.match(component, /aria-busy/);
  assert.match(dashboard, /mobile-ai-slot/);
  assert.doesNotMatch(dashboard, /id: "ia"/);
});
