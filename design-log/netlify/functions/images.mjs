// POST /api/images       upload one image (passcode); body = raw image bytes, content-type header set
// GET  /api/images/:id   serve an image (public)
import { images, json, error, authorized, newId } from "./_lib.mjs";

export const config = { path: ["/api/images", "/api/images/:id"] };

const ALLOWED = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const MAX_BYTES = 5 * 1024 * 1024;

export default async (req, context) => {
  const id = context.params?.id;
  const store = images();

  if (req.method === "GET" && id) {
    const res = await store.getWithMetadata(id, { type: "arrayBuffer" });
    if (!res) return error("Not found", 404);
    return new Response(res.data, {
      headers: {
        "content-type": res.metadata?.contentType || "application/octet-stream",
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  }

  if (req.method === "POST" && !id) {
    if (!authorized(req)) return error("Passcode required", 401);
    const contentType = (req.headers.get("content-type") || "").split(";")[0].trim();
    if (!ALLOWED.has(contentType)) return error("Only JPEG, PNG, GIF or WebP images", 415);
    const data = await req.arrayBuffer();
    if (data.byteLength === 0) return error("Empty upload", 400);
    if (data.byteLength > MAX_BYTES) return error("Image too large (max 5 MB)", 413);
    const key = newId();
    await store.set(key, data, { metadata: { contentType } });
    return json({ id: key, url: `/api/images/${key}` }, 201);
  }

  return error("Method not allowed", 405);
};
