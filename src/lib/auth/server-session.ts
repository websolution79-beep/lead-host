import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/session-cookies";
import { requireEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

export async function getServerSessionUser() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;

  if (!accessToken) {
    return null;
  }

  const supabase = createClient<Database>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);

  if (error || !user) {
    return null;
  }

  return user;
}
