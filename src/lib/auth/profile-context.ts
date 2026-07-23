import { createClient } from "@supabase/supabase-js";
import type { AppRole } from "@/lib/auth/roles";
import { requireEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

type ProfileWithRoles = ProfileRow & {
  user_roles: Array<{ role: AppRole }>;
};

export async function getAuthenticatedProfileContext(accessToken: string) {
  const authUserId = readJwtSubject(accessToken);

  if (!authUserId) {
    return null;
  }

  const supabase = createClient<Database>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );

  const { data, error } = await supabase
    .from("profiles")
    .select("*,user_roles(role)")
    .eq("auth_user_id", authUserId)
    .single();

  if (error || !data) {
    return null;
  }

  const row = data as unknown as ProfileWithRoles;
  const { user_roles: roleRows, ...profile } = row;

  return {
    userId: authUserId,
    profile: profile as ProfileRow,
    roles: (roleRows ?? []).map((item) => item.role),
  };
}

function readJwtSubject(accessToken: string) {
  try {
    const payload = accessToken.split(".")[1];

    if (!payload) {
      return null;
    }

    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as { sub?: unknown };

    return typeof parsed.sub === "string" && parsed.sub ? parsed.sub : null;
  } catch {
    return null;
  }
}
