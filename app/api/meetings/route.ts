import { and, eq, gt, lt, ne } from "drizzle-orm";
import { getDb } from "../../../db";
import { meetings } from "../../../db/schema";
import { ApiError, cleanText, jsonError, requireWorkspace } from "../../lib/server/workspace";

export async function POST(request: Request) {
  try {
    const context = await requireWorkspace();
    const payload = (await request.json()) as {
      title?: string;
      category?: string;
      startsAt?: string;
      endsAt?: string;
      mode?: string;
      guestEmail?: string;
    };
    const title = cleanText(payload.title, 140);
    const category = cleanText(payload.category, 80) || "Reunião interna";
    const mode = cleanText(payload.mode, 120) || "Videoconferência";
    const startsAt = cleanText(payload.startsAt, 40);
    const endsAt = cleanText(payload.endsAt, 40);
    const guestEmail = cleanText(payload.guestEmail, 254).toLowerCase() || null;
    const starts = new Date(startsAt);
    const ends = new Date(endsAt);
    if (!title || Number.isNaN(starts.valueOf()) || Number.isNaN(ends.valueOf()) || ends <= starts) {
      throw new ApiError(400, "Preencha título, início e término corretamente.");
    }

    const db = getDb();
    const [conflict] = await db
      .select({ id: meetings.id, title: meetings.title })
      .from(meetings)
      .where(
        and(
          eq(meetings.organizationId, context.organization.id),
          ne(meetings.status, "CANCELLED"),
          lt(meetings.startsAt, ends.toISOString()),
          gt(meetings.endsAt, starts.toISOString()),
        ),
      )
      .limit(1);
    if (conflict) throw new ApiError(409, `Este horário conflita com “${conflict.title}”.`);

    const [meeting] = await db
      .insert(meetings)
      .values({
        id: crypto.randomUUID(),
        organizationId: context.organization.id,
        creatorProfileId: context.profile.id,
        title,
        category,
        startsAt: starts.toISOString(),
        endsAt: ends.toISOString(),
        mode,
        guestEmail,
      })
      .returning();
    return Response.json({ meeting }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await requireWorkspace();
    const payload = (await request.json()) as { id?: string; status?: "CONFIRMED" | "CANCELLED" };
    if (!payload.id || !payload.status || !["CONFIRMED", "CANCELLED"].includes(payload.status)) {
      throw new ApiError(400, "Atualização inválida.");
    }
    const db = getDb();
    await db
      .update(meetings)
      .set({ status: payload.status })
      .where(and(eq(meetings.id, payload.id), eq(meetings.organizationId, context.organization.id)));
    return Response.json({ updated: true });
  } catch (error) {
    return jsonError(error);
  }
}
