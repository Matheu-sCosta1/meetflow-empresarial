import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";
import { query } from "./db.js";

export type AuthenticatedUser = {
  id: string;
  organizationId: string;
  name: string;
  email: string;
  role: "ADMIN" | "MEMBER";
  jobTitle: string;
  avatarUrl: string | null;
  organizationName: string;
  organizationSlug: string;
};

type UserRow = {
  id: string;
  organization_id: string;
  name: string;
  email: string;
  role: "ADMIN" | "MEMBER";
  job_title: string;
  avatar_url: string | null;
  organization_name: string;
  organization_slug: string;
};

function secret() {
  const value = process.env.MEETFLOW_JWT_SECRET ?? process.env.JWT_SECRET;
  if (!value || value.length < 32) throw new Error("Segredo de autenticação não configurado");
  return value;
}

function encode(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

export function signToken(user: { id: string; email: string }) {
  const header = encode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = encode(JSON.stringify({ sub: user.id, email: user.email, exp: Math.floor(Date.now() / 1000) + 43_200 }));
  const content = `${header}.${payload}`;
  const signature = createHmac("sha256", secret()).update(content).digest("base64url");
  return `${content}.${signature}`;
}

function tokenSubject(token: string) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const content = `${parts[0]}.${parts[1]}`;
  const expected = createHmac("sha256", secret()).update(content).digest();
  const actual = Buffer.from(parts[2], "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as { sub?: string; exp?: number };
    return payload.sub && payload.exp && payload.exp > Date.now() / 1000 ? payload.sub : null;
  } catch {
    return null;
  }
}

export async function authenticated(headers: IncomingHttpHeaders) {
  const authorization = Array.isArray(headers.authorization) ? headers.authorization[0] : headers.authorization;
  if (!authorization?.startsWith("Bearer ")) return null;
  const userId = tokenSubject(authorization.slice(7));
  if (!userId) return null;
  const rows = await query<UserRow>(`SELECT u.id, u.organization_id, u.name, u.email, u.role, u.job_title,
    u.avatar_url, o.name AS organization_name, o.slug AS organization_slug
    FROM users u JOIN organizations o ON o.id = u.organization_id
    WHERE u.id = $1 AND u.active = TRUE`, [userId]);
  return rows[0] ? mapUser(rows[0]) : null;
}

export function mapUser(row: UserRow): AuthenticatedUser {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    email: row.email,
    role: row.role,
    jobTitle: row.job_title,
    avatarUrl: row.avatar_url,
    organizationName: row.organization_name,
    organizationSlug: row.organization_slug,
  };
}

export async function userByEmail(email: string) {
  const rows = await query<UserRow & { password_hash: string; active: boolean }>(`SELECT u.id, u.organization_id,
    u.name, u.email, u.password_hash, u.role, u.job_title, u.avatar_url, u.active,
    o.name AS organization_name, o.slug AS organization_slug
    FROM users u JOIN organizations o ON o.id = u.organization_id WHERE LOWER(u.email) = LOWER($1)`, [email]);
  return rows[0];
}

function derive(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, 64, (error, key) => error ? reject(error) : resolve(key));
  });
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = await derive(password, salt);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, saltValue, hashValue] = stored.split("$");
  if (scheme !== "scrypt" || !saltValue || !hashValue) return false;
  const expected = Buffer.from(hashValue, "base64url");
  const actual = await derive(password, Buffer.from(saltValue, "base64url"));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
