// Browser storage the specs start from.
//
// The tests written for the full interface open it in Advanced mode, as a returning visitor
// would (tutorial seen); the specs about Simple mode start as a first visit with the Welcome
// dialog already closed (SEEN), and the tutorial's spec from an empty profile.
const ORIGIN = "http://127.0.0.1:5173";
const TOUR_SEEN = { name: "qram-tour", value: "seen" };
export const ADVANCED = {
  cookies: [],
  origins: [{ origin: ORIGIN, localStorage: [{ name: "qram-mode", value: "advanced" }, TOUR_SEEN] }],
};
export const SEEN = { cookies: [], origins: [{ origin: ORIGIN, localStorage: [TOUR_SEEN] }] };
