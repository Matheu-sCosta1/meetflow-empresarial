import { getDb } from "../../../db";
import { channels } from "../../../db/schema";
import { ApiError, cleanText, jsonError, requireWorkspace } from "../../lib/server/workspace";

export async function POST(request: Request) {
  try {
    const context = await requireWorkspace();
    const payload = (await request.json()) as { name?: string };
    const name = cleanText(payload.name, 60);
    if (name.length < 2) throw new ApiError(400, "Informe um nome para o canal.");
    const db = getDb();
    const [channel] = await db
      .insert(channels)
      .values({
        id: crypto.randomUUID(),
        organizationId: context.organization.id,
        name,
        kind: "GROUP",
        createdByProfileId: context.profile.id,
      })
      .returning();
    return Response.json({ channel }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
