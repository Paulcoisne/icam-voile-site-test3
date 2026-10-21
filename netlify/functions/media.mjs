import { store } from "../lib/util.mjs";
export default async (req, context) => {
  const key = new URL(req.url).pathname.split("/").pop();
  if (!/^[a-z0-9-]{8,64}$/.test(key || "")) return new Response("Introuvable", { status: 404 });
  const r = await store().getWithMetadata(`media/${key}`, { type: "arrayBuffer" });
  if (!r) return new Response("Introuvable", { status: 404 });
  return new Response(r.data, {
    headers: { "content-type": r.metadata?.type || "image/jpeg", "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:" },
  });
};
export const config = { path: "/api/media/:key" };
