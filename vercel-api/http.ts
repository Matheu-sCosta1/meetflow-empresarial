import Busboy from "busboy";
import type { IncomingMessage, ServerResponse } from "node:http";

export type ApiRequest = IncomingMessage & {
  body?: unknown;
  query: Record<string, string | string[] | undefined>;
};

export type ApiResponse = ServerResponse;

export class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

export function json(response: ApiResponse, status: number, body: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
}

export function empty(response: ApiResponse, status = 204) {
  response.statusCode = status;
  response.end();
}

export async function jsonBody<T>(request: ApiRequest): Promise<T> {
  if (request.body && typeof request.body === "object" && !Buffer.isBuffer(request.body)) return request.body as T;
  if (typeof request.body === "string") return JSON.parse(request.body) as T;
  if (Buffer.isBuffer(request.body)) return JSON.parse(request.body.toString("utf8")) as T;
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  if (!chunks.length) return {} as T;
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
}

export type UploadedFile = { filename: string; mimeType: string; content: Buffer };

export function multipart(request: ApiRequest, maximumBytes = 3_500_000) {
  return new Promise<{ fields: Record<string, string>; file?: UploadedFile }>((resolve, reject) => {
    let parser: ReturnType<typeof Busboy>;
    try {
      parser = Busboy({ headers: request.headers, limits: { files: 1, fileSize: maximumBytes, fields: 10 } });
    } catch {
      reject(new HttpError(400, "Envio de arquivo inválido"));
      return;
    }
    const fields: Record<string, string> = {};
    let file: UploadedFile | undefined;
    let limitReached = false;
    parser.on("field", (name, value) => { fields[name] = value; });
    parser.on("file", (_name, stream, info) => {
      const chunks: Buffer[] = [];
      stream.on("limit", () => { limitReached = true; });
      stream.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      stream.on("end", () => {
        file = { filename: info.filename, mimeType: info.mimeType.toLowerCase(), content: Buffer.concat(chunks) };
      });
    });
    parser.on("error", () => reject(new HttpError(400, "Não foi possível ler o arquivo")));
    parser.on("finish", () => {
      if (limitReached) reject(new HttpError(413, "O arquivo deve ter no máximo 3,5 MB na hospedagem gratuita"));
      else resolve({ fields, file });
    });
    if (Buffer.isBuffer(request.body)) parser.end(request.body);
    else if (typeof request.body === "string") parser.end(Buffer.from(request.body));
    else request.pipe(parser);
  });
}

export function required(value: unknown, label: string, maximum = 255) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new HttpError(400, `${label} é obrigatório`);
  if (text.length > maximum) throw new HttpError(400, `${label} excede o tamanho permitido`);
  return text;
}

export function optional(value: unknown, maximum = 1000) {
  if (value == null) return null;
  const text = String(value).trim();
  if (text.length > maximum) throw new HttpError(400, "Texto excede o tamanho permitido");
  return text || null;
}

export function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
