import { getDb } from "../../../db";
import { statuses } from "../../../db/schema";
import { getRuntimeBindings } from "../../../runtime/env";
import { ApiError, cleanText, jsonError, requireWorkspace } from "../../lib/server/workspace";

const MAX_STATUS_BYTES = 25 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const context = await requireWorkspace();
    const form = await request.formData();
    const caption = cleanText(form.get("caption"), 500);
    const file = form.get("media");
    let mediaKey: string | null = null;
    let mediaType: "IMAGE" | "VIDEO" | "TEXT" = "TEXT";
    if (file instanceof File && file.size > 0) {
      if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
        throw new ApiError(400, "Use uma foto ou um vídeo válido.");
      }
      if (file.size > MAX_STATUS_BYTES) throw new ApiError(413, "O arquivo deve ter no máximo 25 MB.");
      mediaType = file.type.startsWith("video/") ? "VIDEO" : "IMAGE";
      const extension = file.type.split("/")[1]?.split(";")[0] || "bin";
      mediaKey = `org/${context.organization.id}/statuses/${crypto.randomUUID()}.${extension}`;
      await getRuntimeBindings().BUCKET.put(mediaKey, file.stream(), { httpMetadata: { contentType: file.type } });
    }
    if (!caption && !mediaKey) throw new ApiError(400, "Adicione uma legenda, foto ou vídeo.");
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const [status] = await getDb()
      .insert(statuses)
      .values({
        id: crypto.randomUUID(),
        organizationId: context.organization.id,
        authorProfileId: context.profile.id,
        caption,
        mediaKey,
        mediaType,
        createdAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
      })
      .returning();
    return Response.json({ status }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
