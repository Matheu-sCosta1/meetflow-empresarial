import type { ApiRequest, ApiResponse } from "./http.js";
import type { AuthenticatedUser } from "./auth.js";
import { HttpError, json, jsonBody } from "./http.js";
import { query } from "./db.js";

type QueryRow = Record<string, unknown>;
type AiRole = "user" | "assistant";
type AiInputMessage = { role: AiRole; content: string };

const DEFAULT_DAILY_LIMIT = 20;
const DEFAULT_MODEL = "openai/gpt-oss-20b";
const MAX_CONTEXT_MESSAGES = 12;
const MAX_MESSAGE_CHARACTERS = 4_000;
const MAX_CONTEXT_CHARACTERS = 16_000;
const VERCEL_AI_GATEWAY_URL = "https://ai-gateway.vercel.sh/v1/chat/completions";
const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";

type AiProvider = {
  apiKey: string;
  model: string;
  url: string;
  gateway: boolean;
};

function dailyLimit() {
  const configured = Number(process.env.MEETFLOW_AI_DAILY_LIMIT ?? DEFAULT_DAILY_LIMIT);
  return Number.isInteger(configured) && configured >= 1 && configured <= 100 ? configured : DEFAULT_DAILY_LIMIT;
}

function aiMessages(value: unknown): AiInputMessage[] {
  if (!Array.isArray(value) || !value.length) throw new HttpError(400, "Escreva uma pergunta para a IA");
  if (value.length > MAX_CONTEXT_MESSAGES) throw new HttpError(400, "A conversa temporária ficou grande demais. Limpe o chat e tente novamente");

  let totalCharacters = 0;
  const messages = value.map((candidate) => {
    if (!candidate || typeof candidate !== "object") throw new HttpError(400, "Conversa inválida");
    const role = (candidate as Record<string, unknown>).role;
    const contentValue = (candidate as Record<string, unknown>).content;
    if (role !== "user" && role !== "assistant") throw new HttpError(400, "Tipo de mensagem inválido");
    const content = typeof contentValue === "string" ? contentValue.trim() : "";
    if (!content) throw new HttpError(400, "A conversa contém uma mensagem vazia");
    if (content.length > MAX_MESSAGE_CHARACTERS) throw new HttpError(400, "Cada mensagem deve ter no máximo 4.000 caracteres");
    totalCharacters += content.length;
    return { role, content } as AiInputMessage;
  });

  if (totalCharacters > MAX_CONTEXT_CHARACTERS) throw new HttpError(400, "A conversa temporária ficou grande demais. Limpe o chat e tente novamente");
  if (messages.at(-1)?.role !== "user") throw new HttpError(400, "A última mensagem deve ser uma pergunta");
  return messages;
}

async function reserveDailyRequest(userId: string, limit: number) {
  const rows = await query<QueryRow>(`INSERT INTO ai_daily_usage(user_id, usage_date, request_count, updated_at)
    VALUES ($1, CURRENT_DATE, 1, NOW())
    ON CONFLICT (user_id, usage_date) DO UPDATE SET
      request_count = ai_daily_usage.request_count + 1,
      updated_at = NOW()
    WHERE ai_daily_usage.request_count < $2
    RETURNING request_count`, [userId, limit]);
  if (!rows[0]) throw new HttpError(429, `Você atingiu o limite gratuito de ${limit} perguntas de hoje. Amanhã a cota será renovada`);
  return Number(rows[0].request_count);
}

async function releaseDailyRequest(userId: string) {
  await query(`UPDATE ai_daily_usage SET request_count = GREATEST(0, request_count - 1), updated_at = NOW()
    WHERE user_id = $1 AND usage_date = CURRENT_DATE`, [userId]);
}

function assistantText(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) return "";
  const message = (choices[0] as { message?: { content?: unknown } } | undefined)?.message;
  return typeof message?.content === "string" ? message.content.trim() : "";
}

export function aiConfigured() {
  return Boolean(
    process.env.AI_GATEWAY_API_KEY?.trim()
    || process.env.VERCEL_OIDC_TOKEN?.trim()
    || process.env.GROQ_API_KEY?.trim(),
  );
}

function aiProvider(): AiProvider | null {
  const gatewayKey = process.env.AI_GATEWAY_API_KEY?.trim() || process.env.VERCEL_OIDC_TOKEN?.trim();
  if (gatewayKey) {
    return {
      apiKey: gatewayKey,
      model: process.env.AI_GATEWAY_MODEL?.trim() || DEFAULT_MODEL,
      url: VERCEL_AI_GATEWAY_URL,
      gateway: true,
    };
  }

  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (!groqKey) return null;
  return {
    apiKey: groqKey,
    model: process.env.GROQ_MODEL?.trim() || DEFAULT_MODEL,
    url: GROQ_CHAT_URL,
    gateway: false,
  };
}

export async function chatWithAi(request: ApiRequest, response: ApiResponse, user: AuthenticatedUser) {
  const provider = aiProvider();
  if (!provider) throw new HttpError(503, "A MeetFlow IA está preparada, mas ainda precisa ser ativada");

  const body = await jsonBody<{ messages?: unknown }>(request);
  const messages = aiMessages(body.messages);
  const limit = dailyLimit();
  const used = await reserveDailyRequest(user.id, limit);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);

  try {
    const providerResponse = await fetch(provider.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: provider.model,
        messages: [
          {
            role: "system",
            content: "Você é a MeetFlow IA, uma assistente útil, clara e cuidadosa. Responda no idioma do usuário, prefira português do Brasil quando houver dúvida e seja honesta sobre incertezas. Você não tem acesso a reuniões, mensagens, documentos, contas ou dados privados do MeetFlow. Nunca afirme que executou ações no sistema. Para temas médicos, jurídicos, financeiros ou de segurança, informe limites e recomende confirmação profissional quando apropriado.",
          },
          ...messages,
        ],
        temperature: 0.65,
        max_completion_tokens: 900,
        ...(provider.gateway ? {
          providerOptions: {
            gateway: {
              sort: "cost",
              zeroDataRetention: true,
            },
          },
        } : {}),
      }),
      signal: controller.signal,
    });

    if (!providerResponse.ok) {
      if (providerResponse.status === 429) throw new HttpError(503, "A cota gratuita da IA está temporariamente ocupada. Tente novamente em alguns minutos");
      if (providerResponse.status === 401 || providerResponse.status === 403) throw new HttpError(503, "A MeetFlow IA ainda não está configurada corretamente");
      throw new HttpError(503, "A MeetFlow IA está temporariamente indisponível. Tente novamente em instantes");
    }

    const message = assistantText(await providerResponse.json());
    if (!message) throw new HttpError(502, "A IA não conseguiu preparar uma resposta. Tente reformular a pergunta");
    return json(response, 200, { message, remaining: Math.max(0, limit - used), limit });
  } catch (error) {
    await releaseDailyRequest(user.id).catch(() => undefined);
    if (error instanceof HttpError) throw error;
    if ((error as Error).name === "AbortError") throw new HttpError(504, "A IA demorou para responder. Tente novamente");
    throw new HttpError(503, "A MeetFlow IA está temporariamente indisponível. Tente novamente em instantes");
  } finally {
    clearTimeout(timeout);
  }
}
