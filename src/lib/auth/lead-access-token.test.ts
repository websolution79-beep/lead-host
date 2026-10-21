import test from "node:test";
import assert from "node:assert/strict";
import { getLeadAccessToken } from "./lead-access-token";

const client = (userId?: string) => ({ auth: { getSession: async () => ({ data: {
  session: userId ? { user: { id: userId }, access_token: "browser-token" } : null,
} }) } });
const restored = (userId = "member") => ({ accessToken: "restored-token", userId, expiresAt: Math.floor(Date.now() / 1000) + 3600 });

test("existing browser session is used without recovery", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("Unexpected network request"); };
  try { assert.equal(await getLeadAccessToken(client("member"), "member"), "browser-token"); }
  finally { globalThis.fetch = original; }
});

test("concurrent components share recovery and reuse the access token", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    calls++;
    assert.equal(url, "/api/auth/restore");
    assert.equal(init?.method, "POST");
    assert.equal(init?.credentials, "same-origin");
    assert.equal(init?.cache, "no-store");
    assert.deepEqual(JSON.parse(init?.body as string), { userId: "member" });
    await new Promise((resolve) => setTimeout(resolve, 10));
    return Response.json(restored());
  };
  try {
    const auth = client();
    assert.deepEqual(await Promise.all(Array.from({ length: 6 }, () => getLeadAccessToken(auth, "member"))), Array(6).fill("restored-token"));
    assert.equal(await getLeadAccessToken(auth, "member"), "restored-token");
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});

test("expired recovery is not cached and login in another tab allows retry", async () => {
  const original = globalThis.fetch;
  let expired = true;
  globalThis.fetch = async () => expired ? Response.json({}, { status: 401 }) : Response.json(restored());
  try {
    const auth = client();
    assert.equal(await getLeadAccessToken(auth, "member"), null);
    expired = false;
    assert.equal(await getLeadAccessToken(auth, "member"), "restored-token");
  } finally { globalThis.fetch = original; }
});

test("a different browser account must not be used or overwritten", async () => {
  await assert.rejects(getLeadAccessToken(client("other-member"), "member"), /altro account/);
});

test("a recovery response cannot switch the current member", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json(restored("other-member"));
  try { await assert.rejects(getLeadAccessToken(client(), "member"), /Sessione non recuperabile/); }
  finally { globalThis.fetch = original; }
});

test("temporary recovery errors are surfaced and can be retried", async () => {
  const original = globalThis.fetch;
  let unavailable = true;
  globalThis.fetch = async () => unavailable ? Response.json({ error: "Servizio momentaneamente non disponibile" }, { status: 503 }) : Response.json(restored());
  try {
    const auth = client();
    await assert.rejects(getLeadAccessToken(auth, "member"), /momentaneamente/);
    unavailable = false;
    assert.equal(await getLeadAccessToken(auth, "member"), "restored-token");
  } finally { globalThis.fetch = original; }
});

test("browser refresh failure can fall back to a valid server session", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json(restored());
  try {
    const auth = { auth: { getSession: async () => { throw new Error("Refresh failed"); } } };
    assert.equal(await getLeadAccessToken(auth, "member"), "restored-token");
  } finally { globalThis.fetch = original; }
});

test("sign-out invalidates the recovered token instead of retaining access", async () => {
  const original = globalThis.fetch;
  let listener: ((event: string) => void) | undefined;
  let signedOut = false;
  globalThis.fetch = async () => signedOut ? Response.json({}, { status: 401 }) : Response.json(restored());
  try {
    const auth = { auth: { ...client().auth, onAuthStateChange: (callback: (event: string) => void) => { listener = callback; } } };
    assert.equal(await getLeadAccessToken(auth, "member"), "restored-token");
    signedOut = true;
    listener?.("SIGNED_OUT");
    assert.equal(await getLeadAccessToken(auth, "member"), null);
  } finally { globalThis.fetch = original; }
});
