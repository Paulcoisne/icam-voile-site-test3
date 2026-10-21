import { store, json } from "../lib/util.mjs";
export default async () => {
  const c = await store().get("content", { type: "json" });
  return json(c || null, 200, { "cache-control": "public, max-age=0, must-revalidate" });
};
export const config = { path: "/api/content" };
