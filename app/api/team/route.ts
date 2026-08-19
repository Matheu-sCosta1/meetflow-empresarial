import { and, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { memberships, profiles } from "../../../db/schema";
import { ApiError, jsonError, normalizeEmail, requireAdmin, requireWorkspace } from "../../lib/server/workspace";

export async function POST(request: Request) {
  try {
    const context = await requireWorkspace();
    requireAdmin(context.membership.role);
    const payload = (await request.json()) as { email?: string; role?: "ADMIN" | "MEMBER" };
    const email = normalizeEmail(payload.email);
    const role = payload.role === "ADMIN" ? "ADMIN" : "MEMBER";
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new ApiError(400, "Informe um e-mail válido.");
    const db = getDb();
    const [existingMembership] = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.organizationId, context.organization.id), eq(memberships.inviteEmail, email)))
      .limit(1);
    if (existingMembership) throw new ApiError(409, "Esta pessoa já faz parte da equipe ou possui um convite.");
    const [existingProfile] = await db.select().from(profiles).where(eq(profiles.email, email)).limit(1);
    const [membership] = await db
      .insert(memberships)
      .values({
        id: crypto.randomUUID(),
        organizationId: context.organization.id,
        profileId: existingProfile?.id ?? null,
        inviteEmail: email,
        role,
        status: existingProfile ? "ACTIVE" : "PENDING",
      })
      .returning();
    return Response.json({ membership }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
