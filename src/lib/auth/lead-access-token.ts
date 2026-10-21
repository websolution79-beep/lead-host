type BrowserAuthClient = {
  auth: {
    getSession: () => Promise<{ data: { session: {
      access_token: string; user: { id: string };
    } | null } }>;
    onAuthStateChange?: (callback: (event: string) => void) => unknown;
  };
};

type RestoredSession = { accessToken: string; userId: string; expiresAt: number };
type Recovery = { session?: RestoredSession; pending?: Promise<string | null> };
const recoveries = new WeakMap<BrowserAuthClient, Map<string, Recovery>>();

// The server cookie can still be valid after the browser SDK has lost its session.
// Recover only an access token; refresh tokens remain in the HttpOnly cookie.
export async function getLeadAccessToken(client: BrowserAuthClient, expectedUserId: string): Promise<string | null> {
  let localSession;
  try {
    localSession = (await client.auth.getSession()).data.session;
  } catch {
    // A failed browser refresh must not discard an otherwise valid server session.
  }
  if (localSession) {
    if (localSession.user.id !== expectedUserId) throw new Error("La sessione appartiene a un altro account. Riapri la pagina dopo aver salvato le tue note.");
    return localSession.access_token;
  }
  let users = recoveries.get(client);
  if (!users) {
    users = new Map();
    recoveries.set(client, users);
    const sessions = users;
    client.auth.onAuthStateChange?.((event) => {
      if (event === "SIGNED_OUT" || event === "SIGNED_IN") sessions.clear();
    });
  }
  let recovery = users.get(expectedUserId);
  if (!recovery) { recovery = {}; users.set(expectedUserId, recovery); }
  if (recovery.session && recovery.session.expiresAt * 1000 > Date.now() + 30_000) return recovery.session.accessToken;
  if (recovery.pending) return recovery.pending;
  const current = recovery;
  const pending = (async () => {
    const response = await fetch("/api/auth/restore", {
      method: "POST", credentials: "same-origin", cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: expectedUserId }), signal: AbortSignal.timeout(12_000),
    });
    if (response.status === 401) return null;
    const payload = await response.json() as Partial<RestoredSession> & { error?: string };
    if (!response.ok) throw new Error(payload.error ?? "Non riesco a verificare la sessione. Riprova tra poco: i dati inseriti non sono stati cancellati.");
    if (payload.userId !== expectedUserId || typeof payload.accessToken !== "string" || !payload.accessToken ||
        typeof payload.expiresAt !== "number" || payload.expiresAt * 1000 <= Date.now()) {
      throw new Error("Sessione non recuperabile. Accedi nuovamente in un'altra scheda e riprova.");
    }
    current.session = payload as RestoredSession;
    return payload.accessToken;
  })();
  current.pending = pending;
  try { return await pending; } finally { if (current.pending === pending) current.pending = undefined; }
}
