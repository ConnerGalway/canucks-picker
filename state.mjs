/* Canucks Ticket Draft — state endpoint.
   Self-contained on purpose: no local imports, so there is no second file
   that can go missing. @netlify/blobs is imported lazily inside the handler
   so the pure logic below can be unit-tested without it. */

export const DEFAULT_STATE = {
  version: 1,
  phase: "ballots",
  protectedIds: [1, 2, 7, 11, 17, 19, 26, 29, 33],
  disclosedIds: [7],
  exemptIds: [37],
  firstPick: "takt",
  caps: { weekend: 4, marquee: 1 },
  seats: 2,
  priceBasis: "game",
  seatLabel: "Section 116, Row 22, Seats 105 & 106",
  faceConfirmed: true,
  face: {
    "Marquee+": 1168.9, Marquee: 1025, "Premium+": 783.2,
    Premium: 638.5, "Regular+": 530.2, Regular: 385.6
  },
  ballots: { takt: null, conner: null },
  allocation: null,
  approvedAt: null
};

/* Length-independent compare, so a wrong code cannot be probed by timing. */
export function same(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function authorize(role, code, ownerCode, taktCode) {
  if (!ownerCode) return { error: "Server is missing OWNER_CODE.", status: 500 };

  /* TAKT is open by default: anyone with the link can rank and submit.
     Set a TAKT_CODE environment variable to lock that side later — the
     check turns itself on when the variable exists. Either way TAKT still
     never receives the retained set or Conner's ballot (see projection). */
  if (role === "takt") {
    if (!taktCode) return { role: "takt" };
    return same(code || "", taktCode) ? { role: "takt" }
      : { error: "That code was not accepted.", status: 401 };
  }

  if (role === "conner" && same(code || "", ownerCode)) return { role: "conner" };
  return { error: "That code was not accepted.", status: 401 };
}

/* TAKT never receives the retained set or the other side's ballot.
   This is the security boundary — not anything in the browser. */
export function projection(state, role) {
  const out = JSON.parse(JSON.stringify(state));
  if (role === "takt") {
    delete out.protectedIds;
    delete out.exemptIds;
    out.ballots = {
      takt: state.ballots.takt,
      conner: state.ballots.conner ? { at: state.ballots.conner.at } : null
    };
  }
  return out;
}

/* Returns {status, body, next}; `next` is set only when the store must change. */
export function apply(state, role, body) {
  if (body.version !== state.version) {
    return { status: 409, body: { error: "conflict", state: projection(state, role) } };
  }
  const patch = body.patch || {};
  let next;

  if (role === "takt") {
    if (!patch.ballots || !("takt" in patch.ballots)) {
      return { status: 403, body: { error: "TAKT may only submit or withdraw a ballot." } };
    }
    if (state.phase === "published") {
      return { status: 409, body: { error: "The schedule is posted. Ask Conner to reopen it." } };
    }
    const ballot = patch.ballots.takt;
    if (ballot !== null) {
      if (!ballot || !Array.isArray(ballot.order) || !ballot.order.every(Number.isInteger)) {
        return { status: 400, body: { error: "Malformed ballot." } };
      }
      if (new Set(ballot.order).size !== ballot.order.length) {
        return { status: 400, body: { error: "Ballot contains duplicates." } };
      }
    }
    next = { ...state, ballots: { ...state.ballots, takt: ballot } };
    next.phase = next.ballots.takt && next.ballots.conner ? "review" : "ballots";
    if (!ballot) { next.allocation = null; next.approvedAt = null; }
  } else {
    next = { ...state, ...patch };
  }

  next.version = state.version + 1;
  return { status: 200, body: { role, state: projection(next, role) }, next };
}

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

  const { getStore } = await import("@netlify/blobs");
  const store = getStore("canucks-draft");

  let state = await store.get("state", { type: "json" });
  if (!state) {
    state = DEFAULT_STATE;
    await store.setJSON("state", state);
  }

  if (req.method === "GET") return json({ role, state: projection(state, role) });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ error: "Bad request." }, 400); }

  const out = apply(state, role, body);
  if (out.next) await store.setJSON("state", out.next);
  return json(out.body, out.status);
};

export const config = { path: "/api/state" };
