import { getRuntimeBindings } from "../../../runtime/env";
import { ApiError, cleanText, jsonError, requireWorkspace } from "../../lib/server/workspace";

export async function GET(request: Request) {
  try {
    const context = await requireWorkspace();
    const key = cleanText(new URL(request.url).searchParams.get("key"), 500);
    const allowedPrefix = `org/${context.organization.id}/`;
    if (!key.startsWith(allowedPrefix)) throw new ApiError(403, "Arquivo não autorizado.");
    const object = await getRuntimeBindings().BUCKET.get(key);
    if (!object) throw new ApiError(404, "Arquivo não encontrado.");
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("cache-control", "private, max-age=300");
    headers.set("etag", object.httpEtag);
    return new Response(object.body, { headers });
  } catch (error) {
    return jsonError(error);
  }
}
