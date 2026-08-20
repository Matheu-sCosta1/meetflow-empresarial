import type { ApiRequest, ApiResponse } from "../vercel-api/http.js";
import { route } from "../vercel-api/router.js";

export default async function handler(request: ApiRequest, response: ApiResponse) {
  const value = request.query.path;
  const path = (Array.isArray(value) ? value : typeof value === "string" ? value.split("/") : []).filter(Boolean);
  await route(request, response, path);
}
