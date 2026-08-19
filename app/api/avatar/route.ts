import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { profiles } from "../../../db/schema";
import { getRuntimeBindings } from "../../../runtime/env";
import { ApiError, jsonError, mediaUrl, requireWorkspace } from "../../lib/server/workspace";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const context = await requireWorkspace();
    const form = await request.formData();
    const file = form.get("avatar");
    if (!(file instanceof File) || !file.type.startsWith("image/")) {
      throw new ApiError(400, "Selecione uma imagem válida.");
    }
    if (file.size > MAX_AVATAR_BYTES) throw new ApiError(413, "A foto deve ter no máximo 5 MB.");
    const extension = file.type.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
    const key = `org/${context.organization.id}/avatars/${context.profile.id}/${crypto.randomUUID()}.${extension}`;
    const bucket = getRuntimeBindings().BUCKET;
    await bucket.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
    if (context.profile.avatarKey) await bucket.delete(context.profile.avatarKey);
    await getDb()
      .update(profiles)
      .set({ avatarKey: key, updatedAt: new Date().toISOString() })
      .where(eq(profiles.id, context.profile.id));
    return Response.json({ avatarUrl: mediaUrl(key) }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
