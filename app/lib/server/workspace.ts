import { and, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import { memberships, organizations, profiles } from "../../../db/schema";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function cleanText(value: unknown, maxLength = 160) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function normalizeEmail(value: unknown) {
  return cleanText(value, 254).toLowerCase();
}

export function jsonError(error: unknown) {
  if (error instanceof ApiError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error(error);
  return Response.json({ error: "Não foi possível concluir a operação." }, { status: 500 });
}

export async function requireIdentity() {
  const identity = await getChatGPTUser();
  if (!identity) throw new ApiError(401, "Faça login para continuar.");
  return { ...identity, email: normalizeEmail(identity.email) };
}

export async function getWorkspaceContext() {
  const identity = await requireIdentity();
  const db = getDb();
  const [profile] = await db.select().from(profiles).where(eq(profiles.email, identity.email)).limit(1);

  if (!profile) return { identity, profile: null, membership: null, organization: null };

  const [membership] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.profileId, profile.id), eq(memberships.status, "ACTIVE")))
    .limit(1);

  if (!membership) return { identity, profile, membership: null, organization: null };

  const [organization] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, membership.organizationId))
    .limit(1);

  return { identity, profile, membership, organization: organization ?? null };
}

export async function requireWorkspace() {
  const context = await getWorkspaceContext();
  if (!context.profile || !context.membership || !context.organization) {
    throw new ApiError(403, "Conclua o cadastro da sua empresa para continuar.");
  }
  return {
    identity: context.identity,
    profile: context.profile,
    membership: context.membership,
    organization: context.organization,
  };
}

export function requireAdmin(role: string) {
  if (role !== "OWNER" && role !== "ADMIN") {
    throw new ApiError(403, "Somente administradores podem realizar esta ação.");
  }
}

export function mediaUrl(key: string | null) {
  return key ? `/api/media?key=${encodeURIComponent(key)}` : null;
}

export function slugify(value: string) {
  const base = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 42);
  return `${base || "empresa"}-${crypto.randomUUID().slice(0, 6)}`;
}
