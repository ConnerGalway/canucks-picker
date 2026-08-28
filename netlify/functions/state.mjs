import { getStore } from "@netlify/blobs";
import { DEFAULT_STATE, authorize, projection, apply } from "./core.mjs";

const STORE = "canucks-draft";
const KEY = "state";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });

export default async (req) => {
  const auth = authorize(
    req.headers.get("x-role"),
    req.headers.get("x-code"),
    process.env.OWNER_CODE,
    process.env.TAKT_CODE
  );
  if (auth.error) return json({ error: auth.error }, auth.status);
  const role = auth.role;

  const store = getStore(STORE);
  let state = await store.get(KEY, { type: "json" });
  if (!state) {
    state = DEFAULT_STATE;
    await store.setJSON(KEY, state);
  }

  if (req.method === "GET") return json({ role, state: projection(state, role) });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ error: "Bad request." }, 400); }

  const out = apply(state, role, body);
  if (out.next) await store.setJSON(KEY, out.next);
  return json(out.body, out.status);
};

export const config = { path: "/api/state" };
