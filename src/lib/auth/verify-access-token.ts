import { createClient } from "@supabase/supabase-js";
import { requireEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

type VerifiedIdentity = {
  id: string;
  email: string | null;
};

let verifierClient: ReturnType<typeof createClient<Database>> | null = null;

function getVerifierClient() {
  if (!verifierClient) {
    verifierClient = createClient<Database>(
      requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
      requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      },
    );
  }

  return verifierClient;
}

export async function verifyAccessToken(
  accessToken: string,
): Promise<VerifiedIdentity | null> {
  try {
    const { data, error } = await getVerifierClient().auth.getClaims(accessToken);
    const subject = data?.claims?.sub;

    if (error || typeof subject !== "string" || !subject) {
      return null;
    }

    return {
      id: subject,
      email:
        typeof data.claims.email === "string" ? data.claims.email : null,
    };
  } catch {
    return null;
  }
}
