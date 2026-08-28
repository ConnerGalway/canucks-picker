/* Pure logic for the state endpoint — no Netlify imports, so it can be
   unit-tested and run against a local server as well as in production. */

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
  if (!ownerCode || !taktCode) return { error: "Server is missing OWNER_CODE / TAKT_CODE.", status: 500 };
  if (role === "conner" && same(code || "", ownerCode)) return { role: "conner" };
  if (role === "takt" && same(code || "", taktCode)) return { role: "takt" };
  return { error: "That code was not accepted.", status: 401 };
}

/* TAKT never receives the retained set or the other ballot's contents.
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

/* Returns {status, body, next} — `next` set only when the store must be written. */
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
      const seen = new Set(ballot.order);
      if (seen.size !== ballot.order.length) {
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
