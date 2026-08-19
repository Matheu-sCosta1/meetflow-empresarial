import { and, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { channels, messages } from "../../../db/schema";
import { ApiError, cleanText, jsonError, requireWorkspace } from "../../lib/server/workspace";

export async function POST(request: Request) {
  try {
    const context = await requireWorkspace();
    const payload = (await request.json()) as { channelId?: string; content?: string };
    const channelId = cleanText(payload.channelId, 80);
    const content = cleanText(payload.content, 2000);
    if (!channelId || !content) throw new ApiError(400, "Escreva uma mensagem.");
    const db = getDb();
    const [channel] = await db
      .select({ id: channels.id })
      .from(channels)
      .where(and(eq(channels.id, channelId), eq(channels.organizationId, context.organization.id)))
      .limit(1);
    if (!channel) throw new ApiError(404, "Canal não encontrado.");
    const [message] = await db
      .insert(messages)
      .values({
        id: crypto.randomUUID(),
        organizationId: context.organization.id,
        channelId,
        senderProfileId: context.profile.id,
        content,
      })
      .returning();
    return Response.json({ message }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
